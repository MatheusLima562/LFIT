-- Sprint de venda, 1.5: aluno ausente e pausa.
-- * Pausa (`student_pauses`): motivo SEM dado de saúde (viagem, férias, outro) e data de retorno opcional. Em pausa = linha
--   existe e (sem data, ou data >= hoje). Aluno em pausa não conta como ausente e não recebe o aviso no app.
-- * "Sem treinar há 7+ dias" no Início (`get_inactive_students`): alunos ativos, com plano ativo, fora de pausa, cujo
--   último treino (iniciado) — ou, sem treino, o início do plano — passou do limite. Limite = o maior entre
--   `inactive_days` (7) e 1,5 × o intervalo previsto pelo plano (dias do plano ÷ sessões previstas), quando houver.
-- * Aviso gentil no Hoje do aluno (`claim_my_nudge`): mesma regra, no máximo 1 vez a cada `nudge_interval_days` (7).
--   Sem push, sem e-mail. Nada de saúde nem de cobrança no texto.

create table public.student_pauses (
  student_id uuid primary key references public.students (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reason text not null check (reason in ('viagem', 'ferias', 'outro')),
  until date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.student_pauses enable row level security;
revoke all on public.student_pauses from public, anon, authenticated;
grant select on public.student_pauses to authenticated;
grant select, insert, update, delete on public.student_pauses to service_role;
create policy student_pauses_select on public.student_pauses for select to authenticated
  using ((select private.is_staff()) and organization_id = (select private.current_org_id()) and private.can_access_student(student_id));
-- Somente leitura da conta (1.2) vale aqui também.
create trigger org_writable before insert or update or delete on public.student_pauses
  for each row execute function private.enforce_org_writable();

-- Último aviso mostrado ao aluno (fora da API).
create table private.student_nudges (
  student_id uuid primary key references public.students (id) on delete cascade,
  last_shown_at timestamptz not null
);
revoke all on private.student_nudges from public, anon, authenticated;

create function private.student_on_pause(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_pauses p
    where p.student_id = p_student_id and (p.until is null or p.until >= private.today_br())
  )
$$;

-- Dias sem treinar e limite do aluno (plano ativo obrigatório). Nulo = não se aplica.
create function private.student_absence(p_student_id uuid)
returns table (days_since integer, threshold_days integer, last_session_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with plan as (
    select tp.starts_on, tp.ends_on, tp.planned_sessions, tp.no_end
    from public.training_plans tp
    where tp.student_id = p_student_id and tp.status = 'active'
    order by tp.starts_on desc nulls last
    limit 1
  ),
  last_s as (
    select max(w.started_at) as at from public.workout_sessions w where w.student_id = p_student_id
  ),
  base as (
    select
      ls.at as last_at,
      coalesce(ls.at, private.sp_day_start(p.starts_on), (select s.created_at from public.students s where s.id = p_student_id)) as since,
      case
        when p.planned_sessions > 0 and p.starts_on is not null and p.ends_on is not null and not p.no_end
        then ((p.ends_on - p.starts_on + 1)::numeric / p.planned_sessions)
      end as interval_days
    from plan p cross join last_s ls
  )
  select
    floor(extract(epoch from (now() - b.since)) / 86400)::integer,
    greatest(r.inactive_days, coalesce(ceil(b.interval_days * 1.5)::integer, 0)),
    b.last_at
  from base b cross join private.account_rules r
$$;

revoke execute on function private.student_on_pause(uuid), private.student_absence(uuid) from public, anon, authenticated;

-- Pausa (owner ou responsável). Data de retorno, se houver, de hoje em diante; motivo da lista fixa.
create function public.set_student_pause(p_student_id uuid, p_reason text, p_until date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
begin
  if p_reason is null or p_reason not in ('viagem', 'ferias', 'outro') or (p_until is not null and p_until < private.today_br()) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  insert into public.student_pauses (student_id, organization_id, reason, until, created_by)
  values (s.id, s.organization_id, p_reason, p_until, (select auth.uid()))
  on conflict (student_id) do update set reason = excluded.reason, until = excluded.until, created_by = excluded.created_by, created_at = now();
  perform private.audit(s.organization_id, 'student.paused', 'student', s.id, jsonb_build_object('reason', p_reason, 'until', p_until));
end;
$$;

create function public.end_student_pause(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
begin
  delete from public.student_pauses where student_id = s.id;
  perform private.audit(s.organization_id, 'student.pause_ended', 'student', s.id);
end;
$$;

-- Início: alunos sem treinar além do limite (os que o chamador acessa). Só nome e dias — nada de saúde.
create function public.get_inactive_students()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'student_id', x.id, 'first_name', x.first_name, 'last_name', x.last_name,
        'days_since', x.days_since, 'threshold_days', x.threshold_days, 'last_session_at', x.last_session_at
      ) order by x.days_since desc, x.last_name)
    from (
      select acc.id, acc.first_name, acc.last_name, a.days_since, a.threshold_days, a.last_session_at
      from private.dashboard_students() acc
      join public.students s on s.id = acc.id
      cross join lateral private.student_absence(acc.id) a
      where public.student_effective_status(s) = 'active'
        and not private.student_on_pause(acc.id)
        and a.days_since >= a.threshold_days
      order by a.days_since desc
      limit 50
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Aluno (titular): mostrar o aviso gentil agora? Marca a hora quando mostra (no máximo 1 vez a cada 7 dias).
create function public.claim_my_nudge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
  r private.account_rules := private.account_config();
  a record;
  v_last timestamptz;
begin
  select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.student_effective_status(s) <> 'active' or private.student_on_pause(s.id)
     or private.org_access_state(s.organization_id) not in ('ok', 'grace') then
    return jsonb_build_object('show', false);
  end if;
  select * into a from private.student_absence(s.id);
  if a.days_since is null or a.days_since < r.inactive_days then
    return jsonb_build_object('show', false);
  end if;
  select n.last_shown_at into v_last from private.student_nudges n where n.student_id = s.id;
  if v_last is not null and v_last > now() - make_interval(days => r.nudge_interval_days) then
    return jsonb_build_object('show', false);
  end if;
  insert into private.student_nudges (student_id, last_shown_at) values (s.id, now())
  on conflict (student_id) do update set last_shown_at = now();
  return jsonb_build_object('show', true, 'days_since', a.days_since);
end;
$$;

revoke execute on function
  public.set_student_pause(uuid, text, date), public.end_student_pause(uuid), public.get_inactive_students(), public.claim_my_nudge()
from public, anon;
grant execute on function
  public.set_student_pause(uuid, text, date), public.end_student_pause(uuid), public.get_inactive_students(), public.claim_my_nudge()
to authenticated;
