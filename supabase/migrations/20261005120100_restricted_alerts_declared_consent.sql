-- =============================================================================
-- 2.8 — Ajuste: staff com acesso ao aluno mas SEM ser o responsável (ex.: owner
-- quando há um professor designado) também recebe o alerta "restrito" (nível +
-- texto genérico), em vez de "hidden", quando o professor já DECLAROU o
-- consentimento (mesmo sem a confirmação do titular). Sem declaração nenhuma,
-- continua "hidden". O professor responsável sempre viu o detalhe completo
-- (regra da 1.4, inalterada) — is_responsible_for não depende da confirmação.
-- =============================================================================

create function private.is_restricted_health_viewer(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_access_student(p_student_id)
    and not private.is_responsible_for(p_student_id)
    and exists (
      select 1 from public.students s
      where s.id = p_student_id
        and s.health_consent_declared_at is not null
        and s.health_data_consent_at is null
    )
$$;
grant execute on function private.is_restricted_health_viewer(uuid) to authenticated;
revoke execute on function private.is_restricted_health_viewer(uuid) from public, anon;

create or replace function public.student_contraindication_rules(p_student_id uuid)
returns table (
  exercise_id uuid, level public.contraindication_level, note text, condition_name text, group_name text,
  hidden boolean, restricted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if private.can_view_student_health(p_student_id) then
    return query
      select distinct c.exercise_id, c.level, c.note, hc.name, sg.name, false, false
      from public.student_groups x
      join public.special_groups sg on sg.id = x.group_id
      join public.special_group_conditions sgc on sgc.group_id = x.group_id
      join public.health_conditions hc on hc.id = sgc.condition_id and hc.archived_at is null
      join public.exercise_contraindications c
        on c.condition_id = sgc.condition_id
       and (c.organization_id is null or c.organization_id = x.organization_id)
      where x.student_id = p_student_id;
    return;
  end if;

  if private.is_restricted_plan_viewer(p_student_id) or private.is_restricted_health_viewer(p_student_id) then
    -- Só o pior nível por exercício: não revela quantas nem quais condições.
    return query
      select c.exercise_id,
        (case when bool_or(c.level = 'avoid') then 'avoid' else 'caution' end)::public.contraindication_level,
        null::text, null::text, null::text, false, true
      from public.student_groups x
      join public.special_group_conditions sgc on sgc.group_id = x.group_id
      join public.health_conditions hc on hc.id = sgc.condition_id and hc.archived_at is null
      join public.exercise_contraindications c
        on c.condition_id = sgc.condition_id
       and (c.organization_id is null or c.organization_id = x.organization_id)
      where x.student_id = p_student_id
      group by c.exercise_id;
    return;
  end if;

  if private.can_access_student(p_student_id) then
    return query select null::uuid, null::public.contraindication_level, null::text, null::text, null::text, true, false;
    return;
  end if;
  raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
end;
$$;

create or replace function public.plan_contraindication_alerts(p_plan_id uuid)
returns table (
  item_id uuid, exercise_id uuid, substitute boolean,
  level public.contraindication_level, note text, condition_name text, group_name text,
  hidden boolean, restricted boolean
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
  if not private.can_view_student_health(p.student_id)
     and not private.is_restricted_plan_viewer(p.student_id)
     and not private.is_restricted_health_viewer(p.student_id) then
    return query select null::uuid, null::uuid, null::boolean, null::public.contraindication_level, null::text, null::text, null::text, true, false;
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
    select pe.item_id, pe.exercise_id, pe.substitute, r.level, r.note, r.condition_name, r.group_name, false, r.restricted
    from plan_exercises pe
    join public.student_contraindication_rules(p.student_id) r on r.exercise_id = pe.exercise_id;
end;
$$;
