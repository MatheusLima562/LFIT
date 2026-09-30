-- =============================================================================
-- Fase 3 — regra da dor (ajuste do dono após o teste no celular, 30/09/2026):
-- a escala 0–10 é OBRIGATÓRIA ao concluir o exercício somente quando o item tem alerta de contraindicação para aquele
-- aluno (cautela ou evitar, regra global ou da equipe, no exercício principal ou num substituto) OU orientação de
-- cuidado. O servidor calcula e devolve só o booleano `ask_pain` por item — nunca nível, condição, grupo ou nota.
-- No modo restrito (staff que não vê a saúde do aluno) o booleano sai sempre `false`: ele já não registra dor e não pode
-- deduzir quais exercícios têm alerta.
-- =============================================================================

alter table public.session_item_logs rename column care_note_required to pain_required;

-- O exercício tem alerta para este aluno? (grupos especiais → condições ativas → regras globais + da organização)
create function private.student_exercise_has_alert(p_student_id uuid, p_exercise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_groups x
    join public.special_group_conditions sgc on sgc.group_id = x.group_id
    join public.health_conditions hc on hc.id = sgc.condition_id and hc.archived_at is null
    join public.exercise_contraindications c
      on c.condition_id = sgc.condition_id
     and (c.organization_id is null or c.organization_id = x.organization_id)
    where x.student_id = p_student_id and c.exercise_id = p_exercise_id
  )
$$;

-- Divisão no formato do app, com `ask_pain` por item para este aluno (false quando `p_with_pain` é falso).
drop function private.workout_json(uuid);
create function private.workout_json(p_workout_id uuid, p_student_id uuid, p_with_pain boolean)
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
        'ask_pain', p_with_pain and (
          i.care_note is not null
          or private.student_exercise_has_alert(p_student_id, i.exercise_id)
          or exists (
            select 1 from public.plan_item_substitutes x
            where x.item_id = i.id and private.student_exercise_has_alert(p_student_id, x.exercise_id)
          )
        ),
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

-- Cópia da divisão sem o `ask_pain` (modo restrito lendo uma sessão iniciada por outro modo).
create function private.snapshot_without_pain(p_snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_snapshot -> 'items') = 'array' then
    jsonb_set(p_snapshot, '{items}', coalesce((
      select jsonb_agg(i || jsonb_build_object('ask_pain', false) order by n)
      from jsonb_array_elements(p_snapshot -> 'items') with ordinality as a(i, n)
    ), '[]'::jsonb))
  else p_snapshot end
$$;

revoke execute on function
  private.student_exercise_has_alert(uuid, uuid),
  private.workout_json(uuid, uuid, boolean),
  private.snapshot_without_pain(jsonb)
from public, anon, authenticated;

-- Registro do exercício: a dor é obrigatória quando a cópia da divisão pede (ask_pain; cópias antigas: care_note).
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
    organization_id, session_id, item_id, exercise_id, exercise_name, substitute, pain_required
  ) values (
    w.organization_id, w.id, p_item_id,
    (select e.id from public.exercises e where e.id = v_ex),
    coalesce(v_name, '—'), p_substitute is not null,
    coalesce((it ->> 'ask_pain')::boolean, nullif(it ->> 'care_note', '') is not null)
  )
  on conflict (session_id, item_id) do update set
    exercise_id = excluded.exercise_id,
    exercise_name = excluded.exercise_name,
    substitute = excluded.substitute,
    pain_required = excluded.pain_required
  returning * into l;
  return l;
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
  if l.pain_required and p_pain_score is null and not v_restricted then
    raise exception 'PAIN_REQUIRED' using errcode = 'P0001';
  end if;
  update public.session_item_logs
  set pain_score = p_pain_score, completed_at = coalesce(completed_at, now())
  where id = l.id;
end;
$$;

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
      select jsonb_agg(private.workout_json(w.id, (t.s).id, t.mode <> 'restricted') order by w.position)
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
    -- A cópia guarda o `ask_pain` do aluno (calculado sempre, mesmo no modo presencial restrito: a leitura restrita
    -- tira o booleano em get_training_session, e o aluno precisa dele se retomar a sessão).
    insert into public.workout_sessions (
      organization_id, student_id, plan_id, workout_id, workout_label, workout_name, recorded_by, snapshot
    ) values (
      (t.s).organization_id, (t.s).id, p.id, wk.id, wk.label, wk.name, (select auth.uid()),
      private.workout_json(wk.id, (t.s).id, true)
    )
    returning * into w;
  end if;

  update public.workout_sessions set status = 'abandoned'
  where student_id = (t.s).id and status = 'in_progress' and id <> w.id;

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

create or replace function public.get_training_session(p_session_id uuid)
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
    'workout', case when v_restricted then private.snapshot_without_pain(w.snapshot) else w.snapshot end,
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
