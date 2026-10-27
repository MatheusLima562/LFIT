-- =============================================================================
-- Fase 3 — ajustes do dono no banco (30/09/2026), antes das páginas:
--
-- 1. `save_training_plan` PRESERVA os ids de divisões e itens que continuam no plano (atualiza no lugar; só o que é
--    novo ganha id — o do cliente, se estiver livre, para não mudar de novo no próximo salvamento; o que saiu é
--    apagado). A sessão em andamento guarda uma CÓPIA da divisão (`workout_sessions.snapshot`) e é validada contra ela:
--    editar o plano no meio do treino não afeta a sessão aberta — vale a partir da próxima.
-- 2. `session_set_logs.exercise_id`: exercício realmente feito na série (principal ou substituto), para a evolução de
--    cargas por exercício.
-- 3. Modo presencial "restrito": o professor do plano (ou staff sem acesso à saúde do aluno) registra a sessão SEM dor
--    (nem pergunta de dor, nem dor por exercício, nem leitura de dor/comentário). `private.training_mode` decide:
--    'self' (o próprio aluno), 'full' (staff que vê a saúde) ou 'restricted'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Colunas novas / FK
-- -----------------------------------------------------------------------------
alter table public.workout_sessions add column snapshot jsonb not null default '{}'::jsonb;
alter table public.workout_sessions alter column snapshot drop default;

-- O item é referenciado pela cópia da sessão (pode ter saído do plano depois): sem FK.
alter table public.session_item_logs drop constraint session_item_logs_item_id_fkey;

alter table public.session_set_logs add column exercise_id uuid references public.exercises (id) on delete set null;
update public.session_set_logs s set exercise_id = l.exercise_id from public.session_item_logs l where l.id = s.item_log_id;
create index session_set_logs_exercise_idx on public.session_set_logs (exercise_id, logged_at);

-- -----------------------------------------------------------------------------
-- 2) Helpers
-- -----------------------------------------------------------------------------

-- Divisão no formato que o app renderiza (e que fica copiado na sessão). Nunca inclui contraindicação.
create function private.workout_json(p_workout_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', w.id, 'label', w.label, 'name', w.name, 'notes', w.notes, 'position', w.position,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'position', i.position, 'group_key', i.group_key, 'sets', i.sets,
        'quantity_unit', i.quantity_unit, 'quantity_min', i.quantity_min, 'quantity_max', i.quantity_max,
        'quantity_note', i.quantity_note,
        'load_value', i.load_value, 'load_unit', i.load_unit, 'load_text', i.load_text,
        'intensity', i.intensity, 'speed', i.speed, 'tempo', i.tempo, 'rest_min', i.rest_min, 'rest_max', i.rest_max,
        'method', m.name, 'tip', i.tip, 'care_note', i.care_note,
        'exercise', jsonb_build_object(
          'id', e.id, 'name', e.name, 'instructions', e.instructions, 'equipment', e.equipment,
          'video_url', e.video_url, 'video_path', e.video_path, 'poster_path', e.poster_path
        ),
        'substitutes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', se.id, 'name', se.name, 'instructions', se.instructions, 'equipment', se.equipment,
            'video_url', se.video_url, 'video_path', se.video_path, 'poster_path', se.poster_path
          ) order by x.position)
          from public.plan_item_substitutes x join public.exercises se on se.id = x.exercise_id
          where x.item_id = i.id
        ), '[]'::jsonb),
        'sets_detail', coalesce((
          select jsonb_agg(jsonb_build_object(
            'position', st.position, 'set_type', st.set_type,
            'quantity_unit', st.quantity_unit, 'quantity_min', st.quantity_min, 'quantity_max', st.quantity_max,
            'quantity_note', st.quantity_note,
            'load_value', st.load_value, 'load_unit', st.load_unit, 'load_text', st.load_text,
            'intensity', st.intensity, 'speed', st.speed, 'tempo', st.tempo,
            'rest_min', st.rest_min, 'rest_max', st.rest_max
          ) order by st.position)
          from public.plan_item_sets st where st.item_id = i.id
        ), '[]'::jsonb)
      ) order by i.position)
      from public.plan_workout_items i
      join public.exercises e on e.id = i.exercise_id
      left join public.training_methods m on m.id = i.method_id
      where i.workout_id = w.id
    ), '[]'::jsonb)
  )
  from public.plan_workouts w
  where w.id = p_workout_id
$$;

-- Quem pode treinar este aluno e em que modo. Nulo = sem acesso nenhum.
--   'self'       o próprio aluno;
--   'full'       staff com acesso ao aluno que vê a saúde dele (dor incluída);
--   'restricted' staff com acesso ao aluno sem ver a saúde, ou professor do plano ATIVO sem acesso ao aluno — sem dor.
create function private.training_mode(p_student_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_own_student(p_student_id) then 'self'
    when private.is_staff() and (
      private.can_access_student(p_student_id)
      or exists (
        select 1 from public.training_plans t
        where t.student_id = p_student_id and t.status = 'active'
          and t.organization_id = private.current_org_id() and t.trainer_id = (select auth.uid())
      )
    ) then case when private.can_view_student_health(p_student_id) then 'full' else 'restricted' end
  end
$$;

-- Aluno para quem se treina + modo. Nulo = o aluno logado. Sem acesso → STUDENT_NOT_FOUND; status efetivo ≠ active →
-- ACCESS_SUSPENDED (checado só depois do acesso, para não revelar nada a quem não acessa).
create function private.training_target(p_student_id uuid, out s public.students, out mode text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_student_id is null then
    select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  else
    select * into s from public.students
    where id = p_student_id and deleted_at is null and organization_id = private.current_org_id();
  end if;
  mode := case when s.id is null then null else private.training_mode(s.id) end;
  if mode is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.student_effective_status(s) <> 'active' then
    raise exception 'ACCESS_SUSPENDED' using errcode = 'P0001';
  end if;
end;
$$;

drop function private.resolve_training_student(uuid);

-- Divisão sugerida: a seguinte (por posição, com volta) à da última sessão concluída. Os ids das divisões agora são
-- estáveis; o rótulo copiado cobre divisão apagada.
create or replace function private.next_workout_for_plan(p_plan_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with prev as (
    select ws.workout_id, ws.workout_label from public.workout_sessions ws
    where ws.plan_id = p_plan_id and ws.status = 'completed'
    order by ws.started_at desc
    limit 1
  ),
  cur as (
    select w.position from public.plan_workouts w, prev
    where w.plan_id = p_plan_id
      and (w.id = prev.workout_id or (prev.workout_id is null and w.label = prev.workout_label))
    order by w.position
    limit 1
  )
  select coalesce(
    (select w.id from public.plan_workouts w, cur where w.plan_id = p_plan_id and w.position > cur.position order by w.position limit 1),
    (select w.id from public.plan_workouts w where w.plan_id = p_plan_id order by w.position limit 1)
  )
$$;

-- Trava a sessão para escrita: autoriza (qualquer modo), exige sessão em andamento (status gravado) e acesso ativo.
create or replace function private.lock_open_session(p_session_id uuid)
returns public.workout_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
  s public.students;
begin
  select * into w from public.workout_sessions where id = p_session_id for update;
  if not found or private.training_mode(w.student_id) is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into s from public.students where id = w.student_id;
  if public.student_effective_status(s) <> 'active' then
    raise exception 'ACCESS_SUSPENDED' using errcode = 'P0001';
  end if;
  if w.status <> 'in_progress' then
    raise exception 'SESSION_CLOSED' using errcode = 'P0001';
  end if;
  return w;
end;
$$;

-- Registro do exercício na sessão, validado contra a CÓPIA da divisão (não contra o plano atual).
create or replace function private.upsert_item_log(w public.workout_sessions, p_item_id uuid, p_substitute uuid)
returns public.session_item_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  it jsonb;
  sub jsonb;
  v_ex uuid;
  v_name text;
  l public.session_item_logs;
begin
  select value into it from jsonb_array_elements(coalesce(w.snapshot -> 'items', '[]'::jsonb))
  where value ->> 'id' = p_item_id::text;
  if it is null then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_substitute is not null then
    select value into sub from jsonb_array_elements(coalesce(it -> 'substitutes', '[]'::jsonb))
    where value ->> 'id' = p_substitute::text;
    if sub is null then
      raise exception 'INVALID_SUBSTITUTE' using errcode = 'P0001';
    end if;
    v_ex := p_substitute;
    v_name := sub ->> 'name';
  else
    v_ex := (it -> 'exercise' ->> 'id')::uuid;
    v_name := it -> 'exercise' ->> 'name';
  end if;

  insert into public.session_item_logs (
    organization_id, session_id, item_id, exercise_id, exercise_name, substitute, care_note_required
  ) values (
    w.organization_id, w.id, p_item_id,
    -- O exercício pode ter sido excluído depois do início da sessão (FK com set null).
    (select e.id from public.exercises e where e.id = v_ex),
    coalesce(v_name, '—'), p_substitute is not null, nullif(it ->> 'care_note', '') is not null
  )
  on conflict (session_id, item_id) do update set
    exercise_id = excluded.exercise_id,
    exercise_name = excluded.exercise_name,
    substitute = excluded.substitute,
    care_note_required = excluded.care_note_required
  returning * into l;
  return l;
end;
$$;

revoke execute on function
  private.workout_json(uuid),
  private.training_mode(uuid),
  private.training_target(uuid)
from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) RPCs (mesmas assinaturas; get_training_session é nova)
-- -----------------------------------------------------------------------------
create or replace function public.get_my_active_plan(p_student_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record := private.training_target(p_student_id);
  p public.training_plans;
  v_open public.workout_sessions;
begin
  select * into p from public.training_plans where student_id = (t.s).id and status = 'active';
  if not found then
    return null;
  end if;
  -- Professor do plano (sem acesso ao aluno) só treina o plano de que é professor.
  if t.mode = 'restricted' and not private.can_access_student((t.s).id) and p.trainer_id is distinct from (select auth.uid()) then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_open from public.workout_sessions ws
  where ws.student_id = (t.s).id and ws.plan_id = p.id and public.session_effective_status(ws) = 'in_progress'
  order by ws.started_at desc
  limit 1;

  return jsonb_build_object(
    'mode', t.mode,
    'plan', jsonb_build_object(
      'id', p.id, 'name', p.name, 'goal', p.goal, 'notes', p.notes,
      'starts_on', p.starts_on, 'ends_on', p.ends_on, 'no_end', p.no_end,
      'planned_sessions', p.planned_sessions,
      'completed_sessions', (select count(*) from public.workout_sessions x where x.plan_id = p.id and x.status = 'completed')
    ),
    'suggested_workout_id', private.next_workout_for_plan(p.id),
    'open_session', case when v_open.id is null then null else jsonb_build_object(
      'id', v_open.id, 'workout_id', v_open.workout_id, 'started_at', v_open.started_at
    ) end,
    'workouts', coalesce((
      select jsonb_agg(private.workout_json(w.id) order by w.position)
      from public.plan_workouts w where w.plan_id = p.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.start_workout_session(p_plan_id uuid, p_workout_id uuid, p_student_id uuid default null)
returns table (session_id uuid, resumed boolean, ask_pain_checkin boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  t record := private.training_target(p_student_id);
  p public.training_plans;
  wk public.plan_workouts;
  w public.workout_sessions;
  v_resumed boolean := false;
  v_last_answer timestamptz;
begin
  select * into p from public.training_plans where id = p_plan_id and student_id = (t.s).id and status = 'active';
  if not found
     or (t.mode = 'restricted' and not private.can_access_student((t.s).id) and p.trainer_id is distinct from (select auth.uid())) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into wk from public.plan_workouts where id = p_workout_id and plan_id = p.id;
  if not found then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'workout';
  end if;

  select * into w from public.workout_sessions ws
  where ws.student_id = (t.s).id and ws.workout_id = wk.id and public.session_effective_status(ws) = 'in_progress'
  order by ws.started_at desc
  limit 1
  for update;

  if found then
    v_resumed := true;
  else
    insert into public.workout_sessions (
      organization_id, student_id, plan_id, workout_id, workout_label, workout_name, recorded_by, snapshot
    ) values (
      (t.s).organization_id, (t.s).id, p.id, wk.id, wk.label, wk.name, (select auth.uid()), private.workout_json(wk.id)
    )
    returning * into w;
  end if;

  update public.workout_sessions set status = 'abandoned'
  where student_id = (t.s).id and status = 'in_progress' and id <> w.id;

  -- No modo restrito nada sobre dor é perguntado nem revelado.
  if t.mode = 'restricted' then
    return query select w.id, v_resumed, false;
    return;
  end if;

  select max(x.started_at) into v_last_answer
  from public.workout_sessions x
  where x.student_id = (t.s).id and x.pain_checkin is not null and x.id <> w.id;

  return query select
    w.id,
    v_resumed,
    w.pain_checkin is null and exists (
      select 1
      from public.workout_sessions x
      join public.session_item_logs l on l.session_id = x.id
      where x.student_id = (t.s).id
        and x.id <> w.id
        and x.started_at < w.started_at
        and x.started_at > coalesce(v_last_answer, '-infinity'::timestamptz)
        and l.pain_score > 0
    );
end;
$$;

-- Sessão para a tela de execução: a cópia da divisão + o que já foi registrado. Dor, resposta e feedback só fora do
-- modo restrito.
create function public.get_training_session(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
  v_mode text;
  v_restricted boolean;
begin
  select * into w from public.workout_sessions where id = p_session_id;
  v_mode := case when w.id is null then null else private.training_mode(w.student_id) end;
  if v_mode is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_restricted := v_mode = 'restricted';

  return jsonb_build_object(
    'mode', v_mode,
    'session', jsonb_build_object(
      'id', w.id, 'status', public.session_effective_status(w), 'started_at', w.started_at, 'finished_at', w.finished_at,
      'plan_id', w.plan_id, 'workout_id', w.workout_id, 'workout_label', w.workout_label, 'workout_name', w.workout_name,
      'rpe', w.rpe,
      'pain_checkin', case when v_restricted then null else w.pain_checkin end,
      'feedback_note', case when v_restricted then null else w.feedback_note end
    ),
    'workout', w.snapshot,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', l.item_id, 'exercise_id', l.exercise_id, 'exercise_name', l.exercise_name,
        'substitute', l.substitute, 'completed_at', l.completed_at,
        'pain_score', case when v_restricted then null else l.pain_score end,
        'sets', coalesce((
          select jsonb_agg(jsonb_build_object(
            'set_index', st.set_index, 'exercise_id', st.exercise_id, 'quantity_value', st.quantity_value,
            'load_value', st.load_value, 'load_unit', st.load_unit, 'load_text', st.load_text
          ) order by st.set_index)
          from public.session_set_logs st where st.item_log_id = l.id
        ), '[]'::jsonb)
      ))
      from public.session_item_logs l where l.session_id = w.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.record_pain_checkin(p_session_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions := private.lock_open_session(p_session_id);
begin
  if private.training_mode(w.student_id) = 'restricted' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_answer is null or p_answer not in ('normal', 'ainda_incomoda') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'answer';
  end if;
  update public.workout_sessions set pain_checkin = p_answer where id = w.id;
end;
$$;

create or replace function public.log_set(p_session_id uuid, p_item_id uuid, p_set_index integer, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions := private.lock_open_session(p_session_id);
  l public.session_item_logs;
begin
  if p_set_index is null or p_set_index not between 1 and 50 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'set_index';
  end if;
  l := private.upsert_item_log(w, p_item_id, private.try_uuid(p_data ->> 'substitute_exercise_id'));

  insert into public.session_set_logs (
    organization_id, item_log_id, exercise_id, set_index, quantity_value, load_value, load_unit, load_text
  ) values (
    w.organization_id, l.id, l.exercise_id, p_set_index,
    nullif(p_data ->> 'quantity_value', '')::numeric,
    nullif(p_data ->> 'load_value', '')::numeric,
    nullif(p_data ->> 'load_unit', '')::public.load_unit,
    nullif(trim(p_data ->> 'load_text'), '')
  )
  on conflict (item_log_id, set_index) do update set
    exercise_id = excluded.exercise_id,
    quantity_value = excluded.quantity_value,
    load_value = excluded.load_value,
    load_unit = excluded.load_unit,
    load_text = excluded.load_text,
    logged_at = now();
end;
$$;

create or replace function public.complete_session_item(
  p_session_id uuid, p_item_id uuid, p_pain_score integer, p_substitute_exercise_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions := private.lock_open_session(p_session_id);
  v_restricted boolean := private.training_mode(w.student_id) = 'restricted';
  l public.session_item_logs;
begin
  if v_restricted and p_pain_score is not null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_pain_score is not null and p_pain_score not between 0 and 10 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'pain_score';
  end if;
  l := private.upsert_item_log(w, p_item_id, p_substitute_exercise_id);
  if l.care_note_required and p_pain_score is null and not v_restricted then
    raise exception 'PAIN_REQUIRED' using errcode = 'P0001';
  end if;
  update public.session_item_logs
  set pain_score = p_pain_score, completed_at = coalesce(completed_at, now())
  where id = l.id;
end;
$$;

create or replace function public.finish_workout_session(p_session_id uuid, p_rpe integer default null, p_feedback text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
begin
  select * into w from public.workout_sessions where id = p_session_id;
  if found and w.status = 'completed' and private.training_mode(w.student_id) is not null then
    return; -- reenvio da fila local
  end if;

  w := private.lock_open_session(p_session_id);
  if p_rpe is not null and p_rpe not between 1 and 10 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'rpe';
  end if;
  update public.workout_sessions set
    status = 'completed',
    finished_at = now(),
    rpe = p_rpe,
    feedback_note = left(nullif(trim(p_feedback), ''), 300)
  where id = w.id;
end;
$$;

-- Histórico: o próprio aluno (mesmo com acesso suspenso) ou staff que vê a saúde.
create or replace function public.get_my_workout_history(p_student_id uuid default null)
returns table (
  session_id uuid, started_at timestamptz, finished_at timestamptz, status text,
  plan_id uuid, plan_name text, workout_label text, workout_name text, rpe smallint,
  by_trainer boolean, exercises_done integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s public.students;
begin
  if p_student_id is null then
    select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  elsif private.training_mode(p_student_id) = 'full' then
    select * into s from public.students where id = p_student_id and deleted_at is null;
  end if;
  if s.id is null then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
    select ws.id, ws.started_at, ws.finished_at, public.session_effective_status(ws),
      ws.plan_id, tp.name, ws.workout_label, ws.workout_name, ws.rpe,
      ws.recorded_by is distinct from s.user_id,
      (select count(*)::integer from public.session_item_logs l where l.session_id = ws.id and l.completed_at is not null)
    from public.workout_sessions ws
    left join public.training_plans tp on tp.id = ws.plan_id
    where ws.student_id = s.id
    order by ws.started_at desc
    limit 100;
end;
$$;

revoke execute on function public.get_training_session(uuid) from public, anon;
grant execute on function public.get_training_session(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4) save_training_plan preservando ids (o resto igual a 20261010120000)
-- -----------------------------------------------------------------------------
create or replace function public.save_training_plan(p_plan jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_id uuid := nullif(p_plan ->> 'id', '')::uuid;
  v_student uuid := nullif(p_plan ->> 'student_id', '')::uuid;
  v_no_end boolean := coalesce((p_plan ->> 'no_end')::boolean, false);
  v_trainer uuid;
  p public.training_plans;
  w jsonb;
  it jsonb;
  st jsonb;
  sub text;
  pr record;
  v_w uuid;
  v_i uuid;
  v_ex uuid;
  v_sub uuid;
  v_wpos integer := 0;
  v_ipos integer;
  v_spos integer;
  v_subpos integer;
  v_group text;
  v_prev_group text;
  v_seen text[];
  v_items integer := 0;
  v_keep_w uuid[] := '{}';
  v_keep_i uuid[] := '{}';
begin
  if v_id is not null then
    p := private.lock_editable_plan(v_id);
    if p.status = 'archived' then
      raise exception 'PLAN_ARCHIVED' using errcode = 'P0001';
    end if;
  else
    if v_student is not null then
      perform private.lock_accessible_student(v_student);
    end if;
    insert into public.training_plans (organization_id, student_id, name, created_by)
    values (v_org, v_student, left(coalesce(nullif(trim(p_plan ->> 'name'), ''), 'Treino'), 120), (select auth.uid()))
    returning * into p;
  end if;

  if jsonb_typeof(coalesce(p_plan -> 'workouts', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_plan -> 'workouts', '[]'::jsonb)) > 12 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'workouts';
  end if;

  -- Professor do plano: informado (staff da org) ou, por padrão, o responsável pelo aluno.
  if p.student_id is not null then
    if p_plan ? 'trainer_id' then
      v_trainer := nullif(p_plan ->> 'trainer_id', '')::uuid;
    else
      v_trainer := coalesce(p.trainer_id, (select s.trainer_id from public.students s where s.id = p.student_id));
    end if;
    if v_trainer is not null and not exists (
      select 1 from public.profiles pr2
      where pr2.id = v_trainer and pr2.organization_id = p.organization_id and pr2.role in ('owner', 'trainer')
    ) then
      raise exception 'INVALID_TRAINER' using errcode = 'P0001';
    end if;
  end if;

  update public.training_plans set
    name = left(coalesce(nullif(trim(p_plan ->> 'name'), ''), p.name), 120),
    goal = nullif(trim(p_plan ->> 'goal'), ''),
    level = nullif(p_plan ->> 'level', ''),
    starts_on = nullif(p_plan ->> 'starts_on', '')::date,
    ends_on = case when v_no_end then null else nullif(p_plan ->> 'ends_on', '')::date end,
    no_end = v_no_end,
    planned_sessions = nullif(p_plan ->> 'planned_sessions', '')::integer,
    trainer_id = v_trainer,
    notes = nullif(trim(p_plan ->> 'notes'), '')
  where id = p.id
  returning * into p;

  if p.status in ('active', 'scheduled') and (p.starts_on is null or (p.ends_on is null and not p.no_end)) then
    raise exception 'PLAN_DATES_REQUIRED' using errcode = 'P0001';
  end if;

  -- Libera as posições (únicas por plano/divisão) antes de reordenar no lugar.
  update public.plan_workouts set position = position + 1000 where plan_id = p.id;
  update public.plan_workout_items i set position = i.position + 1000
  from public.plan_workouts pw where pw.id = i.workout_id and pw.plan_id = p.id;

  for w in select value from jsonb_array_elements(coalesce(p_plan -> 'workouts', '[]'::jsonb)) loop
    if jsonb_array_length(coalesce(w -> 'items', '[]'::jsonb)) > 40 then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'items';
    end if;

    -- Divisão: mantém o id se já é deste plano; senão usa o id do cliente se estiver livre (ou gera um).
    v_w := private.try_uuid(w ->> 'id');
    if v_w is not null and not (v_w = any (v_keep_w))
       and exists (select 1 from public.plan_workouts x where x.id = v_w and x.plan_id = p.id) then
      update public.plan_workouts set
        label = left(trim(w ->> 'label'), 10), name = nullif(trim(w ->> 'name'), ''),
        notes = nullif(trim(w ->> 'notes'), ''), position = v_wpos
      where id = v_w;
    else
      if v_w is null or v_w = any (v_keep_w) or exists (select 1 from public.plan_workouts x where x.id = v_w) then
        v_w := gen_random_uuid();
      end if;
      insert into public.plan_workouts (id, plan_id, organization_id, label, name, notes, position)
      values (v_w, p.id, p.organization_id, left(trim(w ->> 'label'), 10), nullif(trim(w ->> 'name'), ''),
              nullif(trim(w ->> 'notes'), ''), v_wpos);
    end if;
    v_keep_w := v_keep_w || v_w;

    v_ipos := 0;
    v_prev_group := null;
    v_seen := '{}';
    for it in select value from jsonb_array_elements(coalesce(w -> 'items', '[]'::jsonb)) loop
      v_ex := nullif(it ->> 'exercise_id', '')::uuid;
      if not exists (
        select 1 from public.exercises e
        where e.id = v_ex and (e.organization_id is null or e.organization_id = p.organization_id)
      ) then
        raise exception 'INVALID_EXERCISE' using errcode = 'P0001';
      end if;

      -- Itens do mesmo agrupamento precisam ser contíguos.
      v_group := nullif(trim(it ->> 'group_key'), '');
      if v_group is not null and v_group is distinct from v_prev_group and v_group = any (v_seen) then
        raise exception 'INVALID_GROUP_ORDER' using errcode = 'P0001';
      end if;
      if v_group is not null and not (v_group = any (v_seen)) then
        v_seen := v_seen || v_group;
      end if;
      v_prev_group := v_group;

      select * into pr from private.read_prescription(it);

      -- Item: mesmo critério da divisão (pode mudar de divisão dentro do plano mantendo o id).
      v_i := private.try_uuid(it ->> 'id');
      if v_i is not null and not (v_i = any (v_keep_i)) and exists (
        select 1 from public.plan_workout_items x join public.plan_workouts xw on xw.id = x.workout_id
        where x.id = v_i and xw.plan_id = p.id
      ) then
        update public.plan_workout_items set
          workout_id = v_w, exercise_id = v_ex, position = v_ipos, group_key = v_group,
          sets = nullif(it ->> 'sets', '')::integer,
          load_value = nullif(it ->> 'load_value', '')::numeric,
          load_unit = nullif(it ->> 'load_unit', '')::public.load_unit,
          load_text = nullif(trim(it ->> 'load_text'), ''),
          quantity_unit = pr.unit, quantity_min = pr.qmin, quantity_max = pr.qmax, quantity_note = pr.note,
          intensity = pr.intensity, speed = pr.speed, tempo = pr.tempo, rest_min = pr.rmin, rest_max = pr.rmax,
          method_id = nullif(it ->> 'method_id', '')::uuid,
          objective_id = nullif(it ->> 'objective_id', '')::uuid,
          tip = coalesce(nullif(trim(it ->> 'tip'), ''), nullif(trim(it ->> 'notes'), '')),
          care_note = nullif(trim(it ->> 'care_note'), '')
        where id = v_i;
        delete from public.plan_item_sets where item_id = v_i;
        delete from public.plan_item_substitutes where item_id = v_i;
      else
        if v_i is null or v_i = any (v_keep_i) or exists (select 1 from public.plan_workout_items x where x.id = v_i) then
          v_i := gen_random_uuid();
        end if;
        insert into public.plan_workout_items (
          id, workout_id, organization_id, exercise_id, position, group_key, sets,
          load_value, load_unit, load_text,
          quantity_unit, quantity_min, quantity_max, quantity_note, intensity, speed, tempo, rest_min, rest_max,
          method_id, objective_id, tip, care_note
        ) values (
          v_i, v_w, p.organization_id, v_ex, v_ipos, v_group,
          nullif(it ->> 'sets', '')::integer,
          nullif(it ->> 'load_value', '')::numeric,
          nullif(it ->> 'load_unit', '')::public.load_unit,
          nullif(trim(it ->> 'load_text'), ''),
          pr.unit, pr.qmin, pr.qmax, pr.note, pr.intensity, pr.speed, pr.tempo, pr.rmin, pr.rmax,
          nullif(it ->> 'method_id', '')::uuid,
          nullif(it ->> 'objective_id', '')::uuid,
          -- "notes" = formato antigo (importação/seed); a interface envia "tip".
          coalesce(nullif(trim(it ->> 'tip'), ''), nullif(trim(it ->> 'notes'), '')),
          nullif(trim(it ->> 'care_note'), '')
        );
      end if;
      v_keep_i := v_keep_i || v_i;

      -- Substitutos: até 3, diferentes do principal, visíveis à organização e não arquivados.
      if jsonb_array_length(coalesce(it -> 'substitutes', '[]'::jsonb)) > 3 then
        raise exception 'INVALID_SUBSTITUTE' using errcode = 'P0001', detail = 'max';
      end if;
      v_subpos := 0;
      for sub in select value from jsonb_array_elements_text(coalesce(it -> 'substitutes', '[]'::jsonb)) loop
        v_sub := private.try_uuid(sub);
        if v_sub is null or v_sub = v_ex or not exists (
          select 1 from public.exercises e
          where e.id = v_sub and e.archived_at is null
            and (e.organization_id is null or e.organization_id = p.organization_id)
        ) then
          raise exception 'INVALID_SUBSTITUTE' using errcode = 'P0001';
        end if;
        begin
          insert into public.plan_item_substitutes (item_id, organization_id, exercise_id, position)
          values (v_i, p.organization_id, v_sub, v_subpos);
        exception when unique_violation then
          raise exception 'INVALID_SUBSTITUTE' using errcode = 'P0001', detail = 'duplicate';
        end;
        v_subpos := v_subpos + 1;
      end loop;

      if jsonb_array_length(coalesce(it -> 'sets_detail', '[]'::jsonb)) > 20 then
        raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'sets_detail';
      end if;
      v_spos := 0;
      for st in select value from jsonb_array_elements(coalesce(it -> 'sets_detail', '[]'::jsonb)) loop
        select * into pr from private.read_prescription(st);
        insert into public.plan_item_sets (
          item_id, organization_id, position, set_type, load_value, load_unit, load_text,
          quantity_unit, quantity_min, quantity_max, quantity_note, intensity, speed, tempo, rest_min, rest_max
        ) values (
          v_i, p.organization_id, v_spos,
          coalesce(nullif(st ->> 'set_type', ''), 'work')::public.set_type,
          nullif(st ->> 'load_value', '')::numeric,
          nullif(st ->> 'load_unit', '')::public.load_unit,
          nullif(trim(st ->> 'load_text'), ''),
          pr.unit, pr.qmin, pr.qmax, pr.note, pr.intensity, pr.speed, pr.tempo, pr.rmin, pr.rmax
        );
        v_spos := v_spos + 1;
      end loop;

      v_ipos := v_ipos + 1;
      v_items := v_items + 1;
    end loop;
    v_wpos := v_wpos + 1;
  end loop;

  -- O que saiu do plano é apagado (itens antes das divisões, para não depender da cascata).
  delete from public.plan_workout_items i using public.plan_workouts pw
  where pw.id = i.workout_id and pw.plan_id = p.id and not (i.id = any (v_keep_i));
  delete from public.plan_workouts where plan_id = p.id and not (id = any (v_keep_w));

  perform private.audit(p.organization_id, 'plan.saved', 'training_plan', p.id, jsonb_build_object(
    'template', p.student_id is null, 'workouts', v_wpos, 'items', v_items
  ));
  return p.id;
end;
$$;
