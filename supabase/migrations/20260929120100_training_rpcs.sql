-- =============================================================================
-- Fase 2 — RPCs de planos de treino e alertas de contraindicação.
-- Checklist SECURITY DEFINER (CLAUDE.md): search_path vazio, validação do
-- chamador na primeira linha, sem linhas inteiras como argumento, sem EXECUTE
-- para public/anon.
-- Códigos de erro: PLAN_NOT_FOUND, PLAN_ARCHIVED, PLAN_DATES_REQUIRED,
-- INVALID_EXERCISE, INVALID_GROUP_ORDER, INVALID_INPUT, FORBIDDEN.
-- =============================================================================

-- Plano que o usuário pode EDITAR (trava a linha).
-- Modelo: owner ou quem criou. Plano de aluno: quem acessa o aluno.
create function private.lock_editable_plan(p_plan_id uuid)
returns public.training_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.training_plans;
begin
  select * into p from public.training_plans t
  where t.id = p_plan_id
    and t.organization_id = private.current_org_id()
    and private.is_staff()
    and (
      (t.student_id is null and (private.is_owner() or t.created_by = (select auth.uid())))
      or (t.student_id is not null and private.can_access_student(t.student_id))
    )
  for update;
  if not found then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;
  return p;
end;
$$;

-- Plano que o usuário pode LER (sem trava).
create function private.get_readable_plan(p_plan_id uuid)
returns public.training_plans
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.training_plans;
begin
  select * into p from public.training_plans t where t.id = p_plan_id;
  if not found or not private.can_access_plan(p_plan_id) then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;
  return p;
end;
$$;

-- Copia a estrutura completa (divisões, itens, séries) para um novo plano em rascunho.
create function private.copy_plan(p_source uuid, p_student_id uuid, p_name text)
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

  insert into public.training_plans (organization_id, student_id, name, goal, level, notes, status, source_plan_id)
  values (src.organization_id, p_student_id, left(coalesce(nullif(trim(p_name), ''), src.name), 120), src.goal, src.level, src.notes, 'draft', src.id)
  returning id into v_new;

  for w in select * from public.plan_workouts where plan_id = src.id order by position loop
    insert into public.plan_workouts (plan_id, organization_id, label, name, notes, position)
    values (v_new, src.organization_id, w.label, w.name, w.notes, w.position)
    returning id into v_w;

    for it in select * from public.plan_workout_items where workout_id = w.id order by position loop
      insert into public.plan_workout_items (
        workout_id, organization_id, exercise_id, position, group_key, sets, reps,
        load_value, load_unit, load_text, rest_seconds, tempo, rpe_target, notes
      ) values (
        v_w, src.organization_id, it.exercise_id, it.position, it.group_key, it.sets, it.reps,
        it.load_value, it.load_unit, it.load_text, it.rest_seconds, it.tempo, it.rpe_target, it.notes
      ) returning id into v_i;

      insert into public.plan_item_sets (item_id, organization_id, position, set_type, reps, load_value, load_unit, load_text, rest_seconds)
      select v_i, src.organization_id, s.position, s.set_type, s.reps, s.load_value, s.load_unit, s.load_text, s.rest_seconds
      from public.plan_item_sets s where s.item_id = it.id;
    end loop;
  end loop;

  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Salvar (criar/editar) plano: substitui a estrutura inteira numa transação.
-- -----------------------------------------------------------------------------
create function public.save_training_plan(p_plan jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_id uuid := nullif(p_plan ->> 'id', '')::uuid;
  v_student uuid := nullif(p_plan ->> 'student_id', '')::uuid;
  p public.training_plans;
  w jsonb;
  it jsonb;
  st jsonb;
  v_w uuid;
  v_i uuid;
  v_wpos integer := 0;
  v_ipos integer;
  v_spos integer;
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

  update public.training_plans set
    name = left(coalesce(nullif(trim(p_plan ->> 'name'), ''), p.name), 120),
    goal = nullif(trim(p_plan ->> 'goal'), ''),
    level = nullif(p_plan ->> 'level', ''),
    starts_on = nullif(p_plan ->> 'starts_on', '')::date,
    ends_on = nullif(p_plan ->> 'ends_on', '')::date,
    notes = nullif(trim(p_plan ->> 'notes'), '')
  where id = p.id;

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
      if not exists (
        select 1 from public.exercises e
        where e.id = nullif(it ->> 'exercise_id', '')::uuid
          and (e.organization_id is null or e.organization_id = p.organization_id)
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

      insert into public.plan_workout_items (
        workout_id, organization_id, exercise_id, position, group_key, sets, reps,
        load_value, load_unit, load_text, rest_seconds, tempo, rpe_target, notes
      ) values (
        v_w, p.organization_id, (it ->> 'exercise_id')::uuid, v_ipos, v_group,
        nullif(it ->> 'sets', '')::integer,
        nullif(trim(it ->> 'reps'), ''),
        nullif(it ->> 'load_value', '')::numeric,
        nullif(it ->> 'load_unit', '')::public.load_unit,
        nullif(trim(it ->> 'load_text'), ''),
        nullif(it ->> 'rest_seconds', '')::integer,
        nullif(trim(it ->> 'tempo'), ''),
        nullif(it ->> 'rpe_target', '')::numeric,
        nullif(trim(it ->> 'notes'), '')
      ) returning id into v_i;

      if jsonb_array_length(coalesce(it -> 'sets_detail', '[]'::jsonb)) > 20 then
        raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'sets_detail';
      end if;
      v_spos := 0;
      for st in select value from jsonb_array_elements(coalesce(it -> 'sets_detail', '[]'::jsonb)) loop
        insert into public.plan_item_sets (item_id, organization_id, position, set_type, reps, load_value, load_unit, load_text, rest_seconds)
        values (
          v_i, p.organization_id, v_spos,
          coalesce(nullif(st ->> 'set_type', ''), 'work')::public.set_type,
          nullif(trim(st ->> 'reps'), ''),
          nullif(st ->> 'load_value', '')::numeric,
          nullif(st ->> 'load_unit', '')::public.load_unit,
          nullif(trim(st ->> 'load_text'), ''),
          nullif(st ->> 'rest_seconds', '')::integer
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

-- Ativa o plano do aluno; o ativo anterior é arquivado (substituição confirmada na UI).
create function public.activate_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.training_plans := private.lock_editable_plan(p_plan_id);
begin
  if p.student_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'Modelos não são ativados';
  end if;
  if p.starts_on is null or p.ends_on is null then
    raise exception 'PLAN_DATES_REQUIRED' using errcode = 'P0001';
  end if;

  update public.training_plans set status = 'archived', archived_at = now()
  where student_id = p.student_id and status = 'active' and id <> p.id;
  update public.training_plans set status = 'active', activated_at = now(), archived_at = null
  where id = p.id;

  perform private.audit(p.organization_id, 'plan.activated', 'training_plan', p.id,
    jsonb_build_object('student_id', p.student_id, 'ends_on', p.ends_on));
end;
$$;

create function public.archive_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.training_plans := private.lock_editable_plan(p_plan_id);
begin
  update public.training_plans set status = 'archived', archived_at = now() where id = p.id;
  perform private.audit(p.organization_id, 'plan.archived', 'training_plan', p.id);
end;
$$;

-- Aplica um modelo a um aluno (novo rascunho com o período informado).
create function public.apply_template_to_student(p_template_id uuid, p_student_id uuid, p_starts_on date default null, p_ends_on date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.training_plans := private.get_readable_plan(p_template_id);
  v_new uuid;
begin
  perform private.require_staff();
  if t.student_id is not null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'Não é um modelo';
  end if;
  perform private.lock_accessible_student(p_student_id);
  v_new := private.copy_plan(t.id, p_student_id, t.name);
  update public.training_plans set starts_on = p_starts_on, ends_on = p_ends_on, created_by = (select auth.uid()) where id = v_new;
  perform private.audit(t.organization_id, 'plan.template_applied', 'training_plan', v_new,
    jsonb_build_object('template_id', t.id, 'student_id', p_student_id));
  return v_new;
end;
$$;

-- Salva um plano (de aluno ou modelo) como novo modelo da organização.
create function public.save_plan_as_template(p_plan_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  src public.training_plans := private.get_readable_plan(p_plan_id);
  v_new uuid;
begin
  perform private.require_staff();
  v_new := private.copy_plan(src.id, null, p_name);
  update public.training_plans set created_by = (select auth.uid()) where id = v_new;
  perform private.audit(src.organization_id, 'plan.saved_as_template', 'training_plan', v_new, jsonb_build_object('source', src.id));
  return v_new;
end;
$$;

-- Duplica para o mesmo aluno (ou como outro modelo), em rascunho.
create function public.duplicate_plan(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  src public.training_plans := private.get_readable_plan(p_plan_id);
  v_new uuid;
begin
  perform private.require_staff();
  if src.student_id is not null then
    perform private.lock_accessible_student(src.student_id);
  end if;
  v_new := private.copy_plan(src.id, src.student_id, left(src.name || ' (cópia)', 120));
  update public.training_plans set created_by = (select auth.uid()) where id = v_new;
  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Alertas de contraindicação
-- Só revela condições/grupos a quem pode ver os dados de saúde do aluno.
-- -----------------------------------------------------------------------------

-- Regras (globais + da org) que incidem sobre as condições do aluno, para
-- alertas ao vivo no montador. `hidden = true` (linha única, sem detalhes) quando
-- o usuário não pode ver os dados de saúde deste aluno.
create function public.student_contraindication_rules(p_student_id uuid)
returns table (exercise_id uuid, level public.contraindication_level, note text, condition_name text, group_name text, hidden boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.can_access_student(p_student_id) then
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

-- Alertas de um plano salvo (por item).
create function public.plan_contraindication_alerts(p_plan_id uuid)
returns table (item_id uuid, level public.contraindication_level, note text, condition_name text, group_name text, hidden boolean)
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
    return query select null::uuid, null::public.contraindication_level, null::text, null::text, null::text, true;
    return;
  end if;
  return query
    select i.id, r.level, r.note, r.condition_name, r.group_name, false
    from public.plan_workouts w
    join public.plan_workout_items i on i.workout_id = w.id
    join public.student_contraindication_rules(p.student_id) r on r.exercise_id = i.exercise_id
    where w.plan_id = p.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant execute on function
  public.save_training_plan(jsonb),
  public.activate_plan(uuid),
  public.archive_plan(uuid),
  public.apply_template_to_student(uuid, uuid, date, date),
  public.save_plan_as_template(uuid, text),
  public.duplicate_plan(uuid),
  public.student_contraindication_rules(uuid),
  public.plan_contraindication_alerts(uuid)
to authenticated;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and n.nspname in ('public', 'private')
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end;
$$;
