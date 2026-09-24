-- =============================================================================
-- 2.8 — RPCs de planos v2: prescrição nova, substitutos, método/objetivo, dica,
-- professor do plano, sem expiração, sessões previstas; alertas incluem substitutos;
-- cópia em massa com prévia de alertas.
--
-- Até a interface migrar (2.8.3), save_training_plan aceita também o formato antigo
-- (reps/rest_seconds/rpe_target/notes) e grava AS DUAS fontes de forma consistente:
-- as colunas legadas são derivadas das novas (format_quantity etc.). Remoção das
-- legadas: etapa seguinte à migração da interface (registrado no CLAUDE.md).
-- =============================================================================

-- Texto legado a partir da prescrição nova ("8–12", "20–30 s", "até a falha", "8 por lado").
create function private.format_quantity(p_unit public.quantity_unit, p_min numeric, p_max numeric, p_note text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(nullif(trim(
    case
      when p_unit = 'failure' then 'até a falha'
      when p_min is null then ''
      else replace(trim(trailing '.' from trim(trailing '0' from p_min::text)), '.', ',')
        || case when p_max is not null and p_max <> p_min
             then '–' || replace(trim(trailing '.' from trim(trailing '0' from p_max::text)), '.', ',') else '' end
        || case p_unit when 'seconds' then ' s' when 'minutes' then ' min' when 'meters' then ' m'
             when 'km' then ' km' when 'arrivals' then ' cheg.' else '' end
    end || coalesce(' ' || p_note, '')
  ), ''), 20)
$$;

-- Lê a prescrição de um objeto jsonb (item ou série), aceitando o formato antigo.
create function private.read_prescription(j jsonb)
returns table (
  unit public.quantity_unit, qmin numeric, qmax numeric, note text,
  itype public.intensity_type, ivalue numeric, speed public.speed_preset, tempo text,
  rmin integer, rmax integer
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  q record;
begin
  if j ? 'quantity_unit' then
    unit := coalesce(nullif(j ->> 'quantity_unit', ''), 'reps')::public.quantity_unit;
    qmin := nullif(j ->> 'quantity_min', '')::numeric;
    qmax := nullif(j ->> 'quantity_max', '')::numeric;
    note := nullif(trim(j ->> 'quantity_note'), '');
  else
    select * into q from private.parse_quantity(nullif(trim(j ->> 'reps'), ''));
    unit := q.unit; qmin := q.qmin; qmax := q.qmax; note := q.note;
  end if;
  if unit = 'failure' then qmin := null; qmax := null; end if;
  if qmax = qmin then qmax := null; end if;

  if j ? 'intensity_type' then
    itype := nullif(j ->> 'intensity_type', '')::public.intensity_type;
    ivalue := nullif(j ->> 'intensity_value', '')::numeric;
  elsif nullif(j ->> 'rpe_target', '') is not null then
    itype := 'rpe'; ivalue := (j ->> 'rpe_target')::numeric;
  end if;

  speed := nullif(j ->> 'speed', '')::public.speed_preset;
  tempo := upper(nullif(trim(j ->> 'tempo'), ''));

  if j ? 'rest_min' then
    rmin := nullif(j ->> 'rest_min', '')::integer;
    rmax := nullif(j ->> 'rest_max', '')::integer;
  else
    rmin := nullif(j ->> 'rest_seconds', '')::integer;
  end if;
  if rmax = rmin then rmax := null; end if;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cópia completa (divisões, itens, séries, substitutos) → novo rascunho
-- -----------------------------------------------------------------------------
create or replace function private.copy_plan(p_source uuid, p_student_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  src public.training_plans;
  v_new uuid;
  w public.plan_workouts;
  v_w uuid;
  it public.plan_workout_items;
  v_i uuid;
begin
  select * into src from public.training_plans where id = p_source;

  insert into public.training_plans (
    organization_id, student_id, name, goal, level, notes, status, source_plan_id, planned_sessions, trainer_id
  ) values (
    src.organization_id, p_student_id, left(coalesce(nullif(trim(p_name), ''), src.name), 120), src.goal, src.level,
    src.notes, 'draft', src.id, src.planned_sessions,
    case when p_student_id is null then null else (select s.trainer_id from public.students s where s.id = p_student_id) end
  )
  returning id into v_new;

  for w in select * from public.plan_workouts where plan_id = src.id order by position loop
    insert into public.plan_workouts (plan_id, organization_id, label, name, notes, position)
    values (v_new, src.organization_id, w.label, w.name, w.notes, w.position)
    returning id into v_w;

    for it in select * from public.plan_workout_items where workout_id = w.id order by position loop
      insert into public.plan_workout_items (
        workout_id, organization_id, exercise_id, position, group_key, sets, reps, load_value, load_unit, load_text,
        rest_seconds, tempo, rpe_target, notes, quantity_unit, quantity_min, quantity_max, quantity_note,
        intensity_type, intensity_value, speed, rest_min, rest_max, method_id, objective_id, tip
      ) values (
        v_w, src.organization_id, it.exercise_id, it.position, it.group_key, it.sets, it.reps, it.load_value, it.load_unit,
        it.load_text, it.rest_seconds, it.tempo, it.rpe_target, it.notes, it.quantity_unit, it.quantity_min, it.quantity_max,
        it.quantity_note, it.intensity_type, it.intensity_value, it.speed, it.rest_min, it.rest_max, it.method_id,
        it.objective_id, it.tip
      ) returning id into v_i;

      insert into public.plan_item_sets (
        item_id, organization_id, position, set_type, reps, load_value, load_unit, load_text, rest_seconds,
        quantity_unit, quantity_min, quantity_max, quantity_note, intensity_type, intensity_value, speed, tempo, rest_min, rest_max
      )
      select v_i, src.organization_id, s.position, s.set_type, s.reps, s.load_value, s.load_unit, s.load_text, s.rest_seconds,
        s.quantity_unit, s.quantity_min, s.quantity_max, s.quantity_note, s.intensity_type, s.intensity_value, s.speed, s.tempo,
        s.rest_min, s.rest_max
      from public.plan_item_sets s where s.item_id = it.id;

      insert into public.plan_item_substitutes (item_id, organization_id, exercise_id, position)
      select v_i, src.organization_id, x.exercise_id, x.position
      from public.plan_item_substitutes x where x.item_id = it.id;
    end loop;
  end loop;

  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Salvar (criar/editar) plano v2
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

  delete from public.plan_workouts where plan_id = p.id;

  for w in select value from jsonb_array_elements(coalesce(p_plan -> 'workouts', '[]'::jsonb)) loop
    if jsonb_array_length(coalesce(w -> 'items', '[]'::jsonb)) > 40 then
      raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'items';
    end if;

    insert into public.plan_workouts (plan_id, organization_id, label, name, notes, position)
    values (p.id, p.organization_id, left(trim(w ->> 'label'), 10), nullif(trim(w ->> 'name'), ''), nullif(trim(w ->> 'notes'), ''), v_wpos)
    returning id into v_w;

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

      insert into public.plan_workout_items (
        workout_id, organization_id, exercise_id, position, group_key, sets,
        load_value, load_unit, load_text,
        quantity_unit, quantity_min, quantity_max, quantity_note, intensity_type, intensity_value, speed, tempo, rest_min, rest_max,
        method_id, objective_id, tip,
        -- colunas legadas, derivadas das novas (mantidas até a interface migrar)
        reps, rest_seconds, rpe_target, notes
      ) values (
        v_w, p.organization_id, v_ex, v_ipos, v_group,
        nullif(it ->> 'sets', '')::integer,
        nullif(it ->> 'load_value', '')::numeric,
        nullif(it ->> 'load_unit', '')::public.load_unit,
        nullif(trim(it ->> 'load_text'), ''),
        pr.unit, pr.qmin, pr.qmax, pr.note, pr.itype, pr.ivalue, pr.speed, pr.tempo, pr.rmin, pr.rmax,
        nullif(it ->> 'method_id', '')::uuid,
        nullif(it ->> 'objective_id', '')::uuid,
        coalesce(nullif(trim(it ->> 'tip'), ''), nullif(trim(it ->> 'notes'), '')),
        private.format_quantity(pr.unit, pr.qmin, pr.qmax, pr.note),
        pr.rmin,
        case when pr.itype = 'rpe' then pr.ivalue end,
        left(coalesce(nullif(trim(it ->> 'tip'), ''), nullif(trim(it ->> 'notes'), '')), 300)
      ) returning id into v_i;

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
          quantity_unit, quantity_min, quantity_max, quantity_note, intensity_type, intensity_value, speed, tempo, rest_min, rest_max,
          reps, rest_seconds
        ) values (
          v_i, p.organization_id, v_spos,
          coalesce(nullif(st ->> 'set_type', ''), 'work')::public.set_type,
          nullif(st ->> 'load_value', '')::numeric,
          nullif(st ->> 'load_unit', '')::public.load_unit,
          nullif(trim(st ->> 'load_text'), ''),
          pr.unit, pr.qmin, pr.qmax, pr.note, pr.itype, pr.ivalue, pr.speed, pr.tempo, pr.rmin, pr.rmax,
          private.format_quantity(pr.unit, pr.qmin, pr.qmax, pr.note),
          pr.rmin
        );
        v_spos := v_spos + 1;
      end loop;

      v_ipos := v_ipos + 1;
      v_items := v_items + 1;
    end loop;
    v_wpos := v_wpos + 1;
  end loop;

  perform private.audit(p.organization_id, 'plan.saved', 'training_plan', p.id, jsonb_build_object(
    'template', p.student_id is null, 'workouts', v_wpos, 'items', v_items
  ));
  return p.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Alertas (incluem substitutos)
-- -----------------------------------------------------------------------------
-- O professor do plano que não acessa o aluno recebe só "hidden" (nada de saúde).
create or replace function public.student_contraindication_rules(p_student_id uuid)
returns table (exercise_id uuid, level public.contraindication_level, note text, condition_name text, group_name text, hidden boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.can_access_student(p_student_id) then
    if private.is_staff() and exists (
      select 1 from public.training_plans t
      where t.student_id = p_student_id and t.organization_id = private.current_org_id()
        and t.trainer_id = (select auth.uid())
    ) then
      return query select null::uuid, null::public.contraindication_level, null::text, null::text, null::text, true;
      return;
    end if;
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.can_view_student_health(p_student_id) then
    return query select null::uuid, null::public.contraindication_level, null::text, null::text, null::text, true;
    return;
  end if;
  return query
    select distinct c.exercise_id, c.level, c.note, hc.name, sg.name, false
    from public.student_groups x
    join public.special_groups sg on sg.id = x.group_id
    join public.special_group_conditions sgc on sgc.group_id = x.group_id
    join public.health_conditions hc on hc.id = sgc.condition_id and hc.archived_at is null
    join public.exercise_contraindications c
      on c.condition_id = sgc.condition_id
     and (c.organization_id is null or c.organization_id = x.organization_id)
    where x.student_id = p_student_id;
end;
$$;

drop function public.plan_contraindication_alerts(uuid);
create function public.plan_contraindication_alerts(p_plan_id uuid)
returns table (
  item_id uuid, exercise_id uuid, substitute boolean,
  level public.contraindication_level, note text, condition_name text, group_name text, hidden boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  p public.training_plans := private.get_readable_plan(p_plan_id);
begin
  if p.student_id is null then
    return;
  end if;
  if not private.can_view_student_health(p.student_id) then
    return query select null::uuid, null::uuid, null::boolean, null::public.contraindication_level, null::text, null::text, null::text, true;
    return;
  end if;
  return query
    with plan_exercises as (
      select i.id as item_id, i.exercise_id, false as substitute
      from public.plan_workouts w join public.plan_workout_items i on i.workout_id = w.id
      where w.plan_id = p.id
      union all
      select i.id, x.exercise_id, true
      from public.plan_workouts w
      join public.plan_workout_items i on i.workout_id = w.id
      join public.plan_item_substitutes x on x.item_id = i.id
      where w.plan_id = p.id
    )
    select pe.item_id, pe.exercise_id, pe.substitute, r.level, r.note, r.condition_name, r.group_name, false
    from plan_exercises pe
    join public.student_contraindication_rules(p.student_id) r on r.exercise_id = pe.exercise_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cópia para vários alunos (um erro não interrompe os outros) + prévia de alertas
-- -----------------------------------------------------------------------------
create function public.apply_plan_to_students(
  p_source uuid, p_students uuid[], p_starts_on date, p_ends_on date, p_no_end boolean, p_activate boolean
)
returns table (student_id uuid, plan_id uuid, status public.plan_status, error text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  src public.training_plans := private.get_readable_plan(p_source);
  v_sid uuid;
  v_new uuid;
  v_status public.plan_status;
begin
  perform private.require_staff();
  if coalesce(array_length(p_students, 1), 0) not between 1 and 50 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'students';
  end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'dates';
  end if;
  if p_activate and (p_starts_on is null or (p_ends_on is null and not coalesce(p_no_end, false))) then
    raise exception 'PLAN_DATES_REQUIRED' using errcode = 'P0001';
  end if;

  for v_sid in select distinct unnest(p_students) loop
    begin
      perform private.lock_accessible_student(v_sid);
      v_new := private.copy_plan(src.id, v_sid, src.name);
      update public.training_plans set
        starts_on = p_starts_on,
        ends_on = case when coalesce(p_no_end, false) then null else p_ends_on end,
        no_end = coalesce(p_no_end, false),
        created_by = (select auth.uid())
      where id = v_new;
      v_status := case when p_activate then public.activate_plan(v_new) else 'draft'::public.plan_status end;
      perform private.audit(src.organization_id, 'plan.bulk_applied', 'training_plan', v_new,
        jsonb_build_object('source', src.id, 'student_id', v_sid, 'status', v_status));
      return query select v_sid, v_new, v_status, null::text;
    exception when others then
      return query select v_sid, null::uuid, null::public.plan_status, sqlerrm;
    end;
  end loop;
end;
$$;

create function public.preview_plan_alerts_for_students(p_source uuid, p_students uuid[])
returns table (student_id uuid, avoid integer, caution integer, hidden boolean, error text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  src public.training_plans := private.get_readable_plan(p_source);
  v_sid uuid;
begin
  perform private.require_staff();
  if coalesce(array_length(p_students, 1), 0) not between 1 and 50 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'students';
  end if;
  for v_sid in select distinct unnest(p_students) loop
    if not private.can_access_student(v_sid) then
      return query select v_sid, 0, 0, false, 'STUDENT_NOT_FOUND'::text;
    elsif not private.can_view_student_health(v_sid) then
      return query select v_sid, 0, 0, true, null::text;
    else
      return query
        with ex as (
          select i.exercise_id from public.plan_workouts w join public.plan_workout_items i on i.workout_id = w.id
          where w.plan_id = src.id
          union
          select x.exercise_id from public.plan_workouts w
          join public.plan_workout_items i on i.workout_id = w.id
          join public.plan_item_substitutes x on x.item_id = i.id
          where w.plan_id = src.id
        ), worst as (
          select ex.exercise_id, bool_or(r.level = 'avoid') as is_avoid
          from ex join public.student_contraindication_rules(v_sid) r on r.exercise_id = ex.exercise_id
          group by ex.exercise_id
        )
        select v_sid, count(*) filter (where is_avoid)::integer, count(*) filter (where not is_avoid)::integer, false, null::text
        from worst;
    end if;
  end loop;
end;
$$;

grant execute on function
  public.plan_contraindication_alerts(uuid),
  public.apply_plan_to_students(uuid, uuid[], date, date, boolean, boolean),
  public.preview_plan_alerts_for_students(uuid, uuid[])
to authenticated;
revoke execute on function
  public.plan_contraindication_alerts(uuid),
  public.apply_plan_to_students(uuid, uuid[], date, date, boolean, boolean),
  public.preview_plan_alerts_for_students(uuid, uuid[])
from public, anon;
revoke execute on function private.format_quantity(public.quantity_unit, numeric, numeric, text), private.read_prescription(jsonb)
from public, anon, authenticated;
