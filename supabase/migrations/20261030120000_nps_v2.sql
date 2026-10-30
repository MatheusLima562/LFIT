-- =============================================================================
-- NPS v2: regras num só lugar, cartão automático, "Pedir avaliação" vira lembrete e a equipe vê só agregados.
-- Aditiva quanto a DADOS: nenhuma tabela, coluna ou linha existente é apagada ou alterada. Troca o CORPO de funções do
-- NPS (create or replace, mesmas assinaturas) e revoga o EXECUTE de request_nps (substituída por send_nps_reminder).
-- Decisões do dono (29/10/2026): trimestres fechados; mínimo de 10 respostas; comentário deixa de ser coletado; "Agora
-- não" aparece para a equipe só como "indisponível no momento" (sem data, sem revelar a recusa).
-- =============================================================================

-- 1) Regras num só lugar (muda só por migration; leitura só pelas funções abaixo) ------------------------------------
create table private.nps_settings (
  singleton boolean primary key default true check (singleton),
  min_sessions integer not null check (min_sessions between 1 and 100),
  min_days_of_use integer not null check (min_days_of_use between 0 and 365),
  -- Piso de 90: a exclusion constraint de nps_responses (20261029130000) já garante 90 dias entre respostas.
  interval_days integer not null check (interval_days between 90 and 730),
  snooze_days integer not null check (snooze_days between 1 and 90),
  min_responses integer not null check (min_responses between 5 and 100),
  updated_at timestamptz not null default now()
);
insert into private.nps_settings (min_sessions, min_days_of_use, interval_days, snooze_days, min_responses)
values (8, 30, 90, 14, 10);
revoke all on private.nps_settings from public, anon, authenticated, service_role;

create function private.nps_config()
returns private.nps_settings
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.nps_settings where singleton
$$;

-- Ciclo do aluno = dia da última resposta (ou 1970-01-01 antes da primeira).
create function private.nps_cycle_key(p_student_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(r.submitted_on), date '1970-01-01') from public.nps_responses r where r.student_id = p_student_id
$$;

-- Agregado com mínimo de respostas: abaixo dele, só { enough: false } (nem a contagem).
create function private.nps_aggregate(p_n integer, p_sum integer, p_promoters integer, p_detractors integer, p_min integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_n < p_min then jsonb_build_object('enough', false)
    else jsonb_build_object(
      'enough', true,
      'n', p_n,
      'average', round(p_sum::numeric / p_n, 1),
      'nps', round(100.0 * (p_promoters - p_detractors) / p_n)::integer,
      'promoters', p_promoters,
      'passives', p_n - p_promoters - p_detractors,
      'detractors', p_detractors
    )
  end
$$;

revoke execute on function
  private.nps_config(), private.nps_cycle_key(uuid), private.nps_aggregate(integer, integer, integer, integer, integer)
  from public, anon, authenticated;

-- 2) Critérios lendo a configuração ------------------------------------------------------------------------------------
create or replace function private.nps_eligibility(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg private.nps_settings := private.nps_config();
  s public.students;
  v_today date := private.today_br();
  v_last date;
  v_first timestamptz;
  v_done integer;
  v_base jsonb;
begin
  select * into s from public.students where id = p_student_id and deleted_at is null;
  if not found then
    return jsonb_build_object('eligible', false, 'reason', 'not_found');
  end if;

  select min(coalesce(w.finished_at, w.started_at)), count(*)::integer into v_first, v_done
  from public.workout_sessions w
  where w.student_id = s.id and w.status = 'completed';

  v_base := jsonb_build_object(
    'sessions_done', v_done, 'sessions_needed', cfg.min_sessions,
    'days_needed', cfg.min_days_of_use, 'interval_days', cfg.interval_days
  );

  if s.user_id is null then
    return v_base || jsonb_build_object('eligible', false, 'reason', 'no_account');
  end if;
  if public.student_effective_status(s) <> 'active' then
    return v_base || jsonb_build_object('eligible', false, 'reason', 'inactive');
  end if;

  select max(r.submitted_on) into v_last from public.nps_responses r where r.student_id = s.id;
  if v_last is not null and v_last + cfg.interval_days > v_today then
    return v_base || jsonb_build_object('eligible', false, 'reason', 'recent_response', 'available_on', v_last + cfg.interval_days);
  end if;

  if v_first is null or v_first > now() - make_interval(days => cfg.min_days_of_use) then
    return v_base || jsonb_build_object(
      'eligible', false, 'reason', 'too_early',
      'available_on', case when v_first is null then null else private.sp_day(v_first) + cfg.min_days_of_use end
    );
  end if;
  if v_done < cfg.min_sessions then
    return v_base || jsonb_build_object('eligible', false, 'reason', 'few_sessions');
  end if;

  return v_base || jsonb_build_object('eligible', true, 'reason', null);
end;
$$;

-- 3) Lembrete: um por aluno por ciclo -----------------------------------------------------------------------------------
create table public.nps_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  cycle_key date not null,
  sent_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz not null default now(),
  constraint nps_reminders_one_per_cycle unique (student_id, cycle_key)
);
alter table public.nps_reminders enable row level security;
revoke all on public.nps_reminders from public, anon, authenticated, service_role;
grant select, delete on public.nps_reminders to service_role;
-- Sem política: só as funções abaixo leem e escrevem.

-- 4) Aluno: cartão automático, "Agora não" sem exceção, sem comentário -------------------------------------------------
create or replace function public.get_my_nps_prompt()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.students;
  p public.nps_prompts;
  v_check jsonb;
  v_trainer text;
begin
  select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  if not found then
    return null;
  end if;
  v_check := private.nps_eligibility(s.id);
  if not (v_check ->> 'eligible')::boolean then
    return null;
  end if;

  select * into p from public.nps_prompts where student_id = s.id;
  if found and p.snoozed_until is not null and p.snoozed_until > now() then
    return null;
  end if;

  select split_part(btrim(pr.full_name), ' ', 1) into v_trainer from public.profiles pr where pr.id = s.trainer_id;
  return jsonb_build_object(
    'trainer_first_name', v_trainer,
    'interval_days', (v_check ->> 'interval_days')::integer,
    'reminded', exists (
      select 1 from public.nps_reminders m where m.student_id = s.id and m.cycle_key = private.nps_cycle_key(s.id)
    )
  );
end;
$$;

create or replace function public.snooze_nps_prompt()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
begin
  select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.nps_prompts as p (student_id, organization_id, snoozed_at, snoozed_until)
  values (s.id, s.organization_id, now(), now() + make_interval(days => (private.nps_config()).snooze_days))
  on conflict (student_id) do update
    set snoozed_at = excluded.snoozed_at, snoozed_until = excluded.snoozed_until, requested_at = null, requested_by = null;
end;
$$;

create or replace function public.submit_nps(p_score integer, p_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
  v_check jsonb;
  v_id uuid;
begin
  select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null for update;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_score is null or p_score not between 0 and 10 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'score';
  end if;
  -- Comentário não é mais coletado: a equipe só vê agregados e texto livre identificaria o aluno.
  if nullif(btrim(p_comment), '') is not null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'comment';
  end if;

  v_check := private.nps_eligibility(s.id);
  if not (v_check ->> 'eligible')::boolean then
    raise exception 'NPS_NOT_ELIGIBLE' using errcode = 'P0001', detail = v_check ->> 'reason';
  end if;

  begin
    insert into public.nps_responses (organization_id, student_id, trainer_id, score, comment)
    values (s.organization_id, s.id, s.trainer_id, p_score, null)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'NPS_NOT_ELIGIBLE' using errcode = 'P0001', detail = 'recent_response';
  end;

  delete from public.nps_prompts where student_id = s.id;
  return v_id;
end;
$$;

-- 5) Equipe: status do aluno e lembrete (substitui request_nps) --------------------------------------------------------
-- Estado visto pela equipe. Nunca revela nota nem data da resposta ("respondeu" vira "none", sem data) e nunca revela o
-- "Agora não" (vira "unavailable", sem data).
create function private.nps_staff_state(p_student_id uuid, p_check jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.nps_prompts;
  v_reason text := p_check ->> 'reason';
begin
  if (p_check ->> 'eligible')::boolean then
    select * into p from public.nps_prompts where student_id = p_student_id;
    if found and p.snoozed_until is not null and p.snoozed_until > now() then
      return jsonb_build_object('state', 'unavailable');
    end if;
    return jsonb_build_object('state', 'pending');
  end if;
  if v_reason in ('too_early', 'few_sessions') then
    return jsonb_build_object(
      'state', 'not_yet', 'reason', v_reason, 'available_on', p_check -> 'available_on',
      'sessions_done', p_check -> 'sessions_done', 'sessions_needed', p_check -> 'sessions_needed',
      'days_needed', p_check -> 'days_needed'
    );
  end if;
  if v_reason in ('no_account', 'inactive') then
    return jsonb_build_object('state', v_reason);
  end if;
  return jsonb_build_object('state', 'none');
end;
$$;
revoke execute on function private.nps_staff_state(uuid, jsonb) from public, anon, authenticated;

create function public.get_nps_status(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sent timestamptz;
begin
  perform private.require_staff();
  if not private.can_access_student(p_student_id) then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  select m.sent_at into v_sent
  from public.nps_reminders m
  where m.student_id = p_student_id and m.cycle_key = private.nps_cycle_key(p_student_id);
  return private.nps_staff_state(p_student_id, private.nps_eligibility(p_student_id))
    || jsonb_build_object('reminded_at', v_sent);
end;
$$;

-- Um aluno por chamada; só quando o cartão já está disponível ao aluno ("pending"). Não cria nem antecipa o cartão.
create function public.send_nps_reminder(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
  v_state jsonb := private.nps_staff_state(s.id, private.nps_eligibility(s.id));
  v_key date := private.nps_cycle_key(s.id);
  v_sent timestamptz;
begin
  if v_state ->> 'state' <> 'pending' then
    return v_state || jsonb_build_object('sent', false);
  end if;

  insert into public.nps_reminders (organization_id, student_id, cycle_key, sent_by)
  values (s.organization_id, s.id, v_key, (select auth.uid()))
  on conflict (student_id, cycle_key) do nothing
  returning sent_at into v_sent;

  if v_sent is null then
    select m.sent_at into v_sent from public.nps_reminders m where m.student_id = s.id and m.cycle_key = v_key;
    return v_state || jsonb_build_object('sent', false, 'already', true, 'reminded_at', v_sent);
  end if;
  return v_state || jsonb_build_object('sent', true, 'already', false, 'reminded_at', v_sent);
end;
$$;

revoke execute on function public.get_nps_status(uuid), public.send_nps_reminder(uuid) from public, anon;
grant execute on function public.get_nps_status(uuid), public.send_nps_reminder(uuid) to authenticated;

-- "Pedir avaliação" antigo: sem uso (o lembrete substitui). Fica no banco, sem EXECUTE.
revoke execute on function public.request_nps(uuid) from authenticated;

-- 6) Resumo só com agregados, por trimestre FECHADO, mínimo de respostas da configuração --------------------------------
-- Professor: respostas em que ele era o responsável. Owner: a organização + por professor (cada um com o mesmo mínimo).
-- Nunca devolve aluno, nome, data individual ou comentário.
create or replace function public.get_nps_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_owner boolean := private.is_owner();
  v_uid uuid := (select auth.uid());
  cfg private.nps_settings := private.nps_config();
  v_current date := date_trunc('quarter', private.today_br()::timestamp)::date;
  v_last date := (date_trunc('quarter', private.today_br()::timestamp) - interval '3 months')::date;
  v_from date := (date_trunc('quarter', private.today_br()::timestamp) - interval '12 months')::date;
  v_result jsonb;
begin
  with scoped as (
    select r.trainer_id, r.score, date_trunc('quarter', r.submitted_on::timestamp)::date as q
    from public.nps_responses r
    join public.students s on s.id = r.student_id
    where r.organization_id = v_org
      and s.deleted_at is null
      and r.submitted_on >= v_from
      and r.submitted_on < v_current
      and (v_owner or r.trainer_id = v_uid)
  )
  select jsonb_build_object(
    'min_n', cfg.min_responses,
    'quarter_start', v_last,
    'headline', (
      select private.nps_aggregate(
        count(*)::integer, coalesce(sum(sc.score), 0)::integer,
        (count(*) filter (where sc.score >= 9))::integer, (count(*) filter (where sc.score <= 6))::integer,
        cfg.min_responses)
      from scoped sc
      where sc.q = v_last
    ),
    'quarters', (
      select jsonb_agg(
        jsonb_build_object('quarter_start', g.q::date) || (
          select private.nps_aggregate(
            count(*)::integer, coalesce(sum(sc.score), 0)::integer,
            (count(*) filter (where sc.score >= 9))::integer, (count(*) filter (where sc.score <= 6))::integer,
            cfg.min_responses)
          from scoped sc
          where sc.q = g.q::date
        )
        order by g.q)
      from generate_series(v_from::timestamp, v_last::timestamp, interval '3 months') as g(q)
    ),
    'by_trainer', case when v_owner then (
      select coalesce(jsonb_agg(
        jsonb_build_object('trainer_id', b.trainer_id, 'trainer_name', b.trainer_name) || b.agg
        order by b.trainer_name), '[]'::jsonb)
      from (
        select sc.trainer_id,
               coalesce(pr.full_name, '') as trainer_name,
               private.nps_aggregate(
                 count(*)::integer, coalesce(sum(sc.score), 0)::integer,
                 (count(*) filter (where sc.score >= 9))::integer, (count(*) filter (where sc.score <= 6))::integer,
                 cfg.min_responses) as agg
        from scoped sc
        left join public.profiles pr on pr.id = sc.trainer_id
        where sc.q = v_last
        group by sc.trainer_id, pr.full_name
      ) b
    ) end
  ) into v_result;

  return v_result;
end;
$$;
