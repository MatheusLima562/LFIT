-- Sprint de venda, 1.7: fuso horário por conta e retenção contando alunos arquivados.
--
-- * `organizations.time_zone` (padrão America/Sao_Paulo; lista de fusos do Brasil + Lisboa). Os helpers de calendário
--   (`private.today_br`, `private.sp_day`, `private.sp_day_start` — nomes mantidos para não reescrever dezenas de RPCs)
--   passam a usar o fuso da conta de QUEM CHAMA (`private.current_time_zone`: equipe pela organização; aluno pela
--   organização dele; sem sessão — cron, servidor — São Paulo). Assim "hoje", semana, mês e trimestre de todas as RPCs
--   que usam os helpers seguem a conta. As 3 funções que tinham o fuso escrito no corpo são reescritas aqui.
-- * Retenção (Início): a base (alunos que concluíram treino nos dias 31–60) passa a incluir alunos ARQUIVADOS depois
--   (antes saíam da base e a retenção ficava maior do que é). Só contagens — nenhum nome de aluno arquivado.

-- 1) Fuso por conta ---------------------------------------------------------------------------------------------------
create function private.allowed_time_zones()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife', 'America/Maceio', 'America/Belem',
    'America/Araguaina', 'America/Santarem', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande',
    'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco', 'America/Eirunepe', 'America/Noronha',
    'Europe/Lisbon'
  ]
$$;
grant execute on function private.allowed_time_zones() to authenticated, service_role;

alter table public.organizations
  add column time_zone text not null default 'America/Sao_Paulo' check (time_zone = any (private.allowed_time_zones()));
revoke update (time_zone) on public.organizations from authenticated;

create function private.current_time_zone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select o.time_zone from public.profiles p join public.organizations o on o.id = p.organization_id
     where p.id = (select auth.uid()) and p.role in ('owner', 'trainer')),
    (select o.time_zone from public.students s join public.organizations o on o.id = s.organization_id
     where s.user_id = (select auth.uid()) and s.deleted_at is null limit 1),
    'America/Sao_Paulo'
  )
$$;
grant execute on function private.current_time_zone() to authenticated, service_role;

create or replace function private.today_br()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone private.current_time_zone())::date
$$;

create or replace function private.sp_day_start(p_day date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select p_day::timestamp at time zone private.current_time_zone()
$$;

create or replace function private.sp_day(p_ts timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_ts at time zone private.current_time_zone())::date
$$;

-- Fuso de uma organização específica (gatilhos que gravam data civil, sem depender de quem chama).
create function private.org_time_zone(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select o.time_zone from public.organizations o where o.id = p_org), 'America/Sao_Paulo')
$$;
revoke execute on function private.org_time_zone(uuid) from public, anon, authenticated;

-- Owner muda o fuso da conta (Configurações). Conta em somente leitura: recusado.
create function public.set_organization_time_zone(p_time_zone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_owner();
begin
  perform private.assert_org_writable(v_org);
  if p_time_zone is null or not (p_time_zone = any (private.allowed_time_zones())) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  update public.organizations set time_zone = p_time_zone, updated_at = now() where id = v_org;
  perform private.audit(v_org, 'organization.time_zone_updated', 'organization', v_org, jsonb_build_object('time_zone', p_time_zone));
end;
$$;
revoke execute on function public.set_organization_time_zone(text) from public, anon;
grant execute on function public.set_organization_time_zone(text) to authenticated;

-- 2) Funções que tinham o fuso escrito ---------------------------------------------------------------------------------
-- NPS: dia civil da resposta no fuso da conta do aluno (a regra de 90 dias usa esse dia).
create or replace function private.nps_responses_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select s.organization_id into new.organization_id from public.students s where s.id = new.student_id;
  new.submitted_on := (new.submitted_at at time zone private.org_time_zone(new.organization_id))::date;
  return new;
end;
$$;

create or replace function public.record_red_flag_clearance(
  p_check_id uuid,
  p_kind text,
  p_name text,
  p_on date,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.student_red_flag_checks;
  s public.students;
begin
  select * into c from public.student_red_flag_checks where id = p_check_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  s := private.lock_accessible_student(c.student_id);
  -- Relê com trava depois de validar o acesso.
  select * into c from public.student_red_flag_checks where id = p_check_id for update;
  if cardinality(c.items) = 0 or c.clearance_recorded_at is not null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_kind not in ('medico', 'fisioterapeuta')
    or length(trim(coalesce(p_name, ''))) not between 2 and 120
    or p_on is null or p_on > private.today_br() or p_on < private.sp_day(c.recorded_at) - 30
    or length(coalesce(p_note, '')) > 300
  then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  update public.student_red_flag_checks
  set clearance_kind = p_kind,
      clearance_name = trim(p_name),
      clearance_on = p_on,
      clearance_note = nullif(trim(p_note), ''),
      clearance_recorded_by = (select auth.uid()),
      clearance_recorded_at = now()
  where id = c.id;
  perform private.audit(s.organization_id, 'student.red_flag_clearance_recorded', 'student', s.id);
end;
$$;

-- Perfil do aluno: mês e semanas no fuso da conta (mesmo retorno da versão de 20261119150000).
create or replace function public.get_my_student_profile()
returns table (
  student_id uuid, first_name text, last_name text, photo_path text,
  organization_name text, trainer_name text, trainer_avatar_url text, trainer_office_hours text,
  effective_status public.effective_status,
  sessions_this_month integer, week_streak integer,
  owner_first_name text, personal_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id, s.first_name, s.last_name, s.photo_path, o.name, t.full_name, t.avatar_url, t.preferences ->> 'office_hours',
    public.student_effective_status(s),
    (
      select count(*)::integer from public.workout_sessions ws
      where ws.student_id = s.id and ws.status = 'completed'
        and date_trunc('month', ws.started_at at time zone o.time_zone)
          = date_trunc('month', now() at time zone o.time_zone)
    ),
    coalesce((
      -- Semanas (seg–dom, no fuso da conta) consecutivas terminando na mais recente — só conta se a mais recente com
      -- sessão concluída for a semana atual ou a anterior; senão a sequência "quebrou" e o streak é 0.
      with weeks as (
        select distinct date_trunc('week', ws.started_at at time zone o.time_zone)::date as wk
        from public.workout_sessions ws
        where ws.student_id = s.id and ws.status = 'completed'
      ),
      islands as (
        select wk, wk + (row_number() over (order by wk desc) * 7)::int as grp from weeks
      )
      select case
        when (select max(wk) from weeks) >= date_trunc('week', now() at time zone o.time_zone)::date - 7
        then (select count(*)::integer from islands where grp = (select grp from islands order by wk desc limit 1))
        else 0
      end
    ), 0),
    ow.first_name,
    coalesce(nullif(split_part(trim(t.full_name), ' ', 1), ''), ow.first_name)
  from public.students s
  join public.organizations o on o.id = s.organization_id
  left join public.profiles t on t.id = s.trainer_id
  left join lateral (
    select nullif(split_part(trim(p.full_name), ' ', 1), '') as first_name
    from public.profiles p
    where p.organization_id = s.organization_id and p.role = 'owner'
    order by p.created_at, p.id
    limit 1
  ) ow on true
  where s.user_id = (select auth.uid()) and s.deleted_at is null
$$;

-- 3) Retenção com alunos arquivados -----------------------------------------------------------------------------------
-- Escopo de CONTAGEM (nunca exibido): alunos da organização que o chamador acompanha — owner: todos; professor: os
-- dele —, inclusive arquivados (deleted_at), que `dashboard_students()` exclui.
create function private.dashboard_students_for_counts()
returns table (id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.students s
  where s.organization_id = private.current_org_id()
    and private.is_staff()
    and (private.is_owner() or s.trainer_id = (select auth.uid()))
$$;
revoke execute on function private.dashboard_students_for_counts() from public, anon, authenticated;

create or replace function public.get_dashboard_engagement_retention()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_today date := private.today_br();
  v_result jsonb;
begin
  with acc as (
    select * from private.dashboard_students()
  ),
  acc_all as (
    select * from private.dashboard_students_for_counts()
  ),
  eff as (
    select s.id, public.student_effective_status(s) as status
    from public.students s
    join acc on acc.id = s.id
  ),
  started_7d as (
    select distinct ws.student_id
    from public.workout_sessions ws
    join acc on acc.id = ws.student_id
    where ws.started_at >= private.sp_day_start(v_today - 6)
  ),
  -- Retenção: inclui arquivados (quem treinou nos dias 31–60 e saiu continua na base e conta como NÃO retido).
  done_60d_all as (
    select ws.student_id, private.sp_day(ws.finished_at) as day
    from public.workout_sessions ws
    join acc_all on acc_all.id = ws.student_id
    where ws.status = 'completed' and ws.finished_at >= private.sp_day_start(v_today - 59)
  ),
  done_60d as (
    select ws.student_id, private.sp_day(ws.finished_at) as day, ws.student_rating
    from public.workout_sessions ws
    join acc on acc.id = ws.student_id
    where ws.status = 'completed' and ws.finished_at >= private.sp_day_start(v_today - 59)
  ),
  base as (
    select distinct student_id from done_60d_all where day <= v_today - 30
  ),
  recent as (
    select distinct student_id from done_60d_all where day >= v_today - 29
  ),
  rated as (
    select student_rating as r from done_60d where day >= v_today - 29 and student_rating is not null
  )
  select jsonb_build_object(
    'today', v_today,
    'engagement', jsonb_build_object(
      'active_students', (select count(*) from eff where eff.status = 'active'),
      'trained_7d', (select count(*) from eff join started_7d on started_7d.student_id = eff.id where eff.status = 'active')
    ),
    'retention', jsonb_build_object(
      'base_31_60', (select count(*) from base),
      'retained_0_30', (select count(*) from base join recent using (student_id))
    ),
    -- Primeiro dia com treino concluído (para "Retenção disponível a partir de dd/mm"), inclusive de arquivados.
    'history_since', (
      select min(private.sp_day(ws.finished_at))
      from public.workout_sessions ws
      join acc_all on acc_all.id = ws.student_id
      where ws.status = 'completed'
    ),
    'satisfaction', jsonb_build_object(
      'ratings', (select count(*) from rated),
      'average', (select round(avg(r)::numeric, 2) from rated),
      'distribution', (
        select jsonb_agg(jsonb_build_object('stars', g.i, 'count', (select count(*) from rated where r = g.i)) order by g.i desc)
        from generate_series(1, 5) as g(i)
      )
    )
  ) into v_result;
  return v_result;
end;
$$;
