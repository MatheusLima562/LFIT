-- =============================================================================
-- NPS identificado do aluno para o professor ("Como está sendo treinar com {nome}?", nota 0–10 + comentário opcional).
--
-- * `nps_responses`: uma linha por resposta, com o professor responsável NO MOMENTO (`trainer_id`, cópia). Sem UPDATE
--   nem DELETE pela API; a exclusão do aluno/organização apaga em cascata (direitos do titular). Uma resposta por aluno
--   a cada 90 dias, garantida no banco (exclusion constraint sobre o dia civil de São Paulo).
-- * O comentário é texto livre do aluno e pode conter saúde: só sai do banco pelo próprio aluno (RLS) ou por
--   `get_nps_summary` para quem `can_view_student_health`. Nunca em audit_logs, log, URL ou notificação.
-- * Critérios para responder (`private.nps_eligibility`): conta de aluno, status efetivo `active`, 30 dias desde o
--   primeiro treino concluído, 8+ treinos concluídos e 90 dias desde a última resposta.
-- * `nps_prompts`: estado do cartão por aluno — "Agora não" (14 dias) e "Pedir avaliação" do professor (recusado com o
--   motivo 'snoozed' enquanto vale o "Agora não"). Sem texto: nada é enviado por notificação externa.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- 1) Respostas
-- -----------------------------------------------------------------------------
create table public.nps_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  -- Professor responsável quando o aluno respondeu (nulo = sem professor; a coordenação acompanha).
  trainer_id uuid references auth.users (id) on delete set null,
  score smallint not null check (score between 0 and 10),
  comment text check (comment is null or (length(comment) between 1 and 300 and comment = btrim(comment))),
  submitted_at timestamptz not null default now(),
  -- Dia civil em São Paulo, preenchido pelo gatilho a partir de submitted_at (nunca pelo cliente).
  submitted_on date not null,
  constraint nps_responses_one_per_90_days
    exclude using gist (student_id with =, (daterange(submitted_on, submitted_on + 90)) with &&)
);
create index nps_responses_org_idx on public.nps_responses (organization_id, submitted_on desc);

-- Organização e dia civil sempre derivados do banco (nem o service_role grava outra coisa).
create function private.nps_responses_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select s.organization_id into new.organization_id from public.students s where s.id = new.student_id;
  new.submitted_on := (new.submitted_at at time zone 'America/Sao_Paulo')::date;
  return new;
end;
$$;

create trigger nps_responses_before_insert
  before insert on public.nps_responses
  for each row execute function private.nps_responses_before_insert();

-- Sem UPDATE: a única mudança aceita é a do próprio banco quando o usuário do professor é apagado
-- (on delete set null em trainer_id).
create function private.nps_responses_no_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trainer_id is null
     and (new.id, new.organization_id, new.student_id, new.score, new.comment, new.submitted_at, new.submitted_on)
         is not distinct from
         (old.id, old.organization_id, old.student_id, old.score, old.comment, old.submitted_at, old.submitted_on) then
    return new;
  end if;
  raise exception 'READ_ONLY' using errcode = '42501';
end;
$$;

create trigger nps_responses_no_update
  before update on public.nps_responses
  for each row execute function private.nps_responses_no_update();

alter table public.nps_responses enable row level security;
revoke all on public.nps_responses from public, anon, authenticated, service_role;
-- Aluno lê as próprias respostas. Equipe NÃO lê a tabela: só por get_nps_summary (comentário depende da saúde).
grant select on public.nps_responses to authenticated;
-- service_role: leitura e inserção (seed/testes); nunca update/delete pela API.
grant select, insert on public.nps_responses to service_role;

create policy nps_responses_select_own on public.nps_responses
  for select to authenticated
  using (private.is_own_student(student_id));

-- -----------------------------------------------------------------------------
-- 2) Estado do cartão ("Agora não" e "Pedir avaliação")
-- -----------------------------------------------------------------------------
create table public.nps_prompts (
  student_id uuid primary key references public.students (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requested_at timestamptz,
  requested_by uuid references auth.users (id) on delete set null,
  snoozed_at timestamptz,
  snoozed_until timestamptz
);

alter table public.nps_prompts enable row level security;
revoke all on public.nps_prompts from public, anon, authenticated, service_role;
grant select, delete on public.nps_prompts to service_role;
-- Sem política: só as RPCs abaixo leem e escrevem.

-- -----------------------------------------------------------------------------
-- 3) Critérios (helper fora da API)
-- -----------------------------------------------------------------------------
-- Devolve { eligible, reason, available_on, sessions_done, sessions_needed, days_needed }.
-- reason: not_found | no_account | inactive | recent_response | too_early | few_sessions | null (apto).
create function private.nps_eligibility(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
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

  v_base := jsonb_build_object('sessions_done', v_done, 'sessions_needed', 8, 'days_needed', 30);

  if s.user_id is null then
    return v_base || jsonb_build_object('eligible', false, 'reason', 'no_account');
  end if;
  if public.student_effective_status(s) <> 'active' then
    return v_base || jsonb_build_object('eligible', false, 'reason', 'inactive');
  end if;

  select max(r.submitted_on) into v_last from public.nps_responses r where r.student_id = s.id;
  if v_last is not null and v_last + 90 > v_today then
    return v_base || jsonb_build_object('eligible', false, 'reason', 'recent_response', 'available_on', v_last + 90);
  end if;

  if v_first is null or v_first > now() - interval '30 days' then
    return v_base || jsonb_build_object(
      'eligible', false, 'reason', 'too_early',
      'available_on', case when v_first is null then null else private.sp_day(v_first) + 30 end
    );
  end if;
  if v_done < 8 then
    return v_base || jsonb_build_object('eligible', false, 'reason', 'few_sessions');
  end if;

  return v_base || jsonb_build_object('eligible', true, 'reason', null);
end;
$$;
revoke execute on function private.nps_eligibility(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4) Aluno: cartão, "Agora não" e resposta
-- -----------------------------------------------------------------------------
-- Cartão a mostrar agora? null = não (inclusive para quem não é aluno). Só o primeiro nome do professor.
create function public.get_my_nps_prompt()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.students;
  p public.nps_prompts;
  v_trainer text;
begin
  select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  if not found or not (private.nps_eligibility(s.id) ->> 'eligible')::boolean then
    return null;
  end if;

  -- "Agora não" vale até o fim: nem o pedido do professor fura (request_nps recusa com reason = 'snoozed').
  select * into p from public.nps_prompts where student_id = s.id;
  if found and p.snoozed_until is not null and p.snoozed_until > now() then
    return null;
  end if;

  select split_part(btrim(pr.full_name), ' ', 1) into v_trainer from public.profiles pr where pr.id = s.trainer_id;
  return jsonb_build_object('trainer_first_name', v_trainer);
end;
$$;

create function public.snooze_nps_prompt()
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
  values (s.id, s.organization_id, now(), now() + interval '14 days')
  on conflict (student_id) do update
    set snoozed_at = excluded.snoozed_at, snoozed_until = excluded.snoozed_until, requested_at = null, requested_by = null;
end;
$$;

create function public.submit_nps(p_score integer, p_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
  v_comment text := nullif(btrim(p_comment), '');
  v_check jsonb;
  v_id uuid;
begin
  -- Só o próprio aluno: staff, anônimo (sem EXECUTE) e aluno excluído não chegam aqui.
  select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null for update;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_score is null or p_score not between 0 and 10 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'score';
  end if;
  if v_comment is not null and length(v_comment) > 300 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'comment';
  end if;

  v_check := private.nps_eligibility(s.id);
  if not (v_check ->> 'eligible')::boolean then
    raise exception 'NPS_NOT_ELIGIBLE' using errcode = 'P0001', detail = v_check ->> 'reason';
  end if;

  begin
    insert into public.nps_responses (organization_id, student_id, trainer_id, score, comment)
    values (s.organization_id, s.id, s.trainer_id, p_score, v_comment)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'NPS_NOT_ELIGIBLE' using errcode = 'P0001', detail = 'recent_response';
  end;

  delete from public.nps_prompts where student_id = s.id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Equipe: "Pedir avaliação" (um aluno por chamada) e resumo
-- -----------------------------------------------------------------------------
-- Owner ou professor responsável. Não apto → devolve o motivo (nada gravado). Aluno em "Agora não" → não grava e
-- devolve reason = 'snoozed' com o dia em que libera (o pedido não fura a escolha do aluno). Já pedido → não repete.
create function public.request_nps(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
  v_check jsonb := private.nps_eligibility(s.id);
  p public.nps_prompts;
begin
  if not (v_check ->> 'eligible')::boolean then
    return v_check || jsonb_build_object('requested', false);
  end if;

  select * into p from public.nps_prompts where student_id = s.id;
  if found and p.snoozed_until is not null and p.snoozed_until > now() then
    return v_check || jsonb_build_object('requested', false, 'reason', 'snoozed', 'available_on', private.sp_day(p.snoozed_until));
  end if;
  if found and p.requested_at is not null and p.requested_at > coalesce(p.snoozed_at, '-infinity'::timestamptz) then
    return v_check || jsonb_build_object('requested', true, 'already', true);
  end if;

  insert into public.nps_prompts as np (student_id, organization_id, requested_at, requested_by)
  values (s.id, s.organization_id, now(), (select auth.uid()))
  on conflict (student_id) do update set requested_at = excluded.requested_at, requested_by = excluded.requested_by;
  return v_check || jsonb_build_object('requested', true, 'already', false);
end;
$$;

-- Resumo dos últimos 90 dias (cada aluno responde no máximo uma vez nesse período) + tendência dos últimos 4 trimestres.
-- Professor: respostas em que ele era o responsável E que ele ainda acompanha. Owner: a organização, com o agregado por
-- professor. NPS só com n >= 10. Detratores: nome, nota e data; o comentário só para quem vê a saúde do aluno.
create function public.get_nps_summary()
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
  v_today date := private.today_br();
  v_since date := private.today_br() - 89;
  v_quarter date := date_trunc('quarter', private.today_br()::timestamp)::date;
  v_result jsonb;
begin
  with scoped as (
    select r.id, r.student_id, r.trainer_id, r.score, r.comment, r.submitted_at, r.submitted_on,
           s.first_name || ' ' || s.last_name as student_name
    from public.nps_responses r
    join public.students s on s.id = r.student_id
    where r.organization_id = v_org
      and s.deleted_at is null
      and (v_owner or (r.trainer_id = v_uid and s.trainer_id = v_uid))
  ),
  recent as (
    select * from scoped where submitted_on >= v_since
  ),
  totals as (
    select count(*)::integer as n,
           count(*) filter (where score >= 9)::integer as promoters,
           count(*) filter (where score between 7 and 8)::integer as passives,
           count(*) filter (where score <= 6)::integer as detractors
    from recent
  ),
  quarters as (
    select q::date as quarter_start,
           count(sc.id)::integer as n,
           count(sc.id) filter (where sc.score >= 9)::integer as promoters,
           count(sc.id) filter (where sc.score <= 6)::integer as detractors
    from generate_series((v_quarter - interval '9 months')::timestamp, v_quarter::timestamp, interval '3 months') q
    left join scoped sc on date_trunc('quarter', sc.submitted_on::timestamp)::date = q::date
    group by q
  ),
  by_trainer as (
    select r.trainer_id,
           coalesce(pr.full_name, '') as trainer_name,
           count(*)::integer as n,
           count(*) filter (where r.score >= 9)::integer as promoters,
           count(*) filter (where r.score between 7 and 8)::integer as passives,
           count(*) filter (where r.score <= 6)::integer as detractors
    from recent r
    left join public.profiles pr on pr.id = r.trainer_id
    group by r.trainer_id, pr.full_name
  )
  select jsonb_build_object(
    'since', v_since,
    'min_n', 10,
    'n', t.n,
    'promoters', t.promoters,
    'passives', t.passives,
    'detractors', t.detractors,
    'nps', case when t.n >= 10 then round(100.0 * (t.promoters - t.detractors) / t.n)::integer end,
    'quarters', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'quarter_start', q.quarter_start, 'n', q.n,
        'nps', case when q.n >= 10 then round(100.0 * (q.promoters - q.detractors) / q.n)::integer end
      ) order by q.quarter_start), '[]'::jsonb)
      from quarters q
    ),
    'detractor_list', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'student_id', d.student_id,
        'student_name', d.student_name,
        'score', d.score,
        'submitted_at', d.submitted_at,
        'comment', case when private.can_view_student_health(d.student_id) then d.comment end,
        'comment_hidden', d.comment is not null and not private.can_view_student_health(d.student_id)
      ) order by d.submitted_at desc), '[]'::jsonb)
      from (select * from recent where score <= 6 order by submitted_at desc limit 50) d
    ),
    'by_trainer', case when v_owner then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'trainer_id', b.trainer_id, 'trainer_name', b.trainer_name, 'n', b.n,
        'promoters', b.promoters, 'passives', b.passives, 'detractors', b.detractors,
        'nps', case when b.n >= 10 then round(100.0 * (b.promoters - b.detractors) / b.n)::integer end
      ) order by b.n desc, b.trainer_name), '[]'::jsonb)
      from by_trainer b
    ) end
  ) into v_result
  from totals t;

  return v_result;
end;
$$;

revoke execute on function
  public.get_my_nps_prompt(), public.snooze_nps_prompt(), public.submit_nps(integer, text),
  public.request_nps(uuid), public.get_nps_summary()
  from public, anon;
grant execute on function
  public.get_my_nps_prompt(), public.snooze_nps_prompt(), public.submit_nps(integer, text),
  public.request_nps(uuid), public.get_nps_summary()
  to authenticated;
