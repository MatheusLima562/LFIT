-- =============================================================================
-- 2.8 — Remoção das colunas legadas da prescrição, depois da migração da interface (2.8.3).
-- Os dados já estão nas colunas novas desde 20261004120200 (quantity_*, intensity_*, speed,
-- tempo, rest_min/max, tip). save_training_plan continua ACEITANDO o formato antigo na
-- entrada (reps, rest_seconds, rpe_target, notes) via private.read_prescription — útil para
-- o seed e para a Importação do MFIT —, mas só grava as colunas novas.
-- =============================================================================

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
        workout_id, organization_id, exercise_id, position, group_key, sets, load_value, load_unit, load_text,
        tempo, quantity_unit, quantity_min, quantity_max, quantity_note,
        intensity_type, intensity_value, speed, rest_min, rest_max, method_id, objective_id, tip
      ) values (
        v_w, src.organization_id, it.exercise_id, it.position, it.group_key, it.sets, it.load_value, it.load_unit,
        it.load_text, it.tempo, it.quantity_unit, it.quantity_min, it.quantity_max,
        it.quantity_note, it.intensity_type, it.intensity_value, it.speed, it.rest_min, it.rest_max, it.method_id,
        it.objective_id, it.tip
      ) returning id into v_i;

      insert into public.plan_item_sets (
        item_id, organization_id, position, set_type, load_value, load_unit, load_text,
        quantity_unit, quantity_min, quantity_max, quantity_note, intensity_type, intensity_value, speed, tempo, rest_min, rest_max
      )
      select v_i, src.organization_id, s.position, s.set_type, s.load_value, s.load_unit, s.load_text,
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
        method_id, objective_id, tip
      ) values (
        v_w, p.organization_id, v_ex, v_ipos, v_group,
        nullif(it ->> 'sets', '')::integer,
        nullif(it ->> 'load_value', '')::numeric,
        nullif(it ->> 'load_unit', '')::public.load_unit,
        nullif(trim(it ->> 'load_text'), ''),
        pr.unit, pr.qmin, pr.qmax, pr.note, pr.itype, pr.ivalue, pr.speed, pr.tempo, pr.rmin, pr.rmax,
        nullif(it ->> 'method_id', '')::uuid,
        nullif(it ->> 'objective_id', '')::uuid,
        -- "notes" = formato antigo (importação/seed); a interface envia "tip".
        coalesce(nullif(trim(it ->> 'tip'), ''), nullif(trim(it ->> 'notes'), ''))
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
          quantity_unit, quantity_min, quantity_max, quantity_note, intensity_type, intensity_value, speed, tempo, rest_min, rest_max
        ) values (
          v_i, p.organization_id, v_spos,
          coalesce(nullif(st ->> 'set_type', ''), 'work')::public.set_type,
          nullif(st ->> 'load_value', '')::numeric,
          nullif(st ->> 'load_unit', '')::public.load_unit,
          nullif(trim(st ->> 'load_text'), ''),
          pr.unit, pr.qmin, pr.qmax, pr.note, pr.itype, pr.ivalue, pr.speed, pr.tempo, pr.rmin, pr.rmax
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

alter table public.plan_workout_items
  drop column reps,
  drop column rest_seconds,
  drop column rpe_target,
  drop column notes;

alter table public.plan_item_sets
  drop column reps,
  drop column rest_seconds;

drop function private.format_quantity(public.quantity_unit, numeric, numeric, text);
drop function private.format_number(numeric);
