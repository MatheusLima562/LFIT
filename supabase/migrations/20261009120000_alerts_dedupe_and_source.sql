-- =============================================================================
-- Bug do teste da Fase B (2.10): a mesma condição podia gerar DUAS linhas de alerta para o
-- mesmo exercício quando havia regra global E regra da equipe para a mesma condição+exercício
-- (ex.: "Abdominal supra" com "Evitar" da equipe endurecendo o "Cautela" global). Agora, por
-- (grupo, condição, exercício), só o PIOR nível vira o alerta principal; a outra camada (se
-- houver) entra como `other_*`, para a UI mostrar como detalhe recolhido ("Regra global: cautela").
-- Nos modos restrito/oculto os campos novos ficam null (nada a mais é revelado).
-- =============================================================================

drop function public.plan_contraindication_alerts(uuid);
drop function public.student_contraindication_rules(uuid);

create function public.student_contraindication_rules(p_student_id uuid)
returns table (
  exercise_id uuid, level public.contraindication_level, note text, condition_name text, group_name text,
  hidden boolean, restricted boolean, is_global boolean,
  other_level public.contraindication_level, other_note text, other_is_global boolean
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
      with matched as (
        select x.group_id, sgc.condition_id, hc.name as condition_name, sg.name as group_name,
               c.exercise_id, c.level, c.note, (c.organization_id is null) as is_global
        from public.student_groups x
        join public.special_groups sg on sg.id = x.group_id
        join public.special_group_conditions sgc on sgc.group_id = x.group_id
        join public.health_conditions hc on hc.id = sgc.condition_id and hc.archived_at is null
        join public.exercise_contraindications c
          on c.condition_id = sgc.condition_id
         and (c.organization_id is null or c.organization_id = x.organization_id)
        where x.student_id = p_student_id
      ),
      ranked as (
        select m.*,
          row_number() over (partition by group_id, condition_id, exercise_id order by (level = 'avoid') desc, is_global) as rn
        from matched m
      )
      select r1.exercise_id, r1.level, r1.note, r1.condition_name, r1.group_name, false, false, r1.is_global,
             r2.level, r2.note, r2.is_global
      from ranked r1
      left join ranked r2
        on r2.group_id = r1.group_id and r2.condition_id = r1.condition_id and r2.exercise_id = r1.exercise_id and r2.rn = 2
      where r1.rn = 1;
    return;
  end if;

  if private.is_restricted_plan_viewer(p_student_id) or private.is_restricted_health_viewer(p_student_id) then
    -- Só o pior nível por exercício: não revela quantas nem quais condições, nem a camada.
    return query
      select c.exercise_id,
        (case when bool_or(c.level = 'avoid') then 'avoid' else 'caution' end)::public.contraindication_level,
        null::text, null::text, null::text, false, true, null::boolean, null::public.contraindication_level, null::text, null::boolean
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
    return query select null::uuid, null::public.contraindication_level, null::text, null::text, null::text, true, false,
      null::boolean, null::public.contraindication_level, null::text, null::boolean;
    return;
  end if;
  raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
end;
$$;

create function public.plan_contraindication_alerts(p_plan_id uuid)
returns table (
  item_id uuid, exercise_id uuid, substitute boolean,
  level public.contraindication_level, note text, condition_name text, group_name text,
  hidden boolean, restricted boolean, is_global boolean,
  other_level public.contraindication_level, other_note text, other_is_global boolean
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
    return query select null::uuid, null::uuid, null::boolean, null::public.contraindication_level, null::text, null::text, null::text,
      true, false, null::boolean, null::public.contraindication_level, null::text, null::boolean;
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
    select pe.item_id, pe.exercise_id, pe.substitute, r.level, r.note, r.condition_name, r.group_name, false, r.restricted,
           r.is_global, r.other_level, r.other_note, r.other_is_global
    from plan_exercises pe
    join public.student_contraindication_rules(p.student_id) r on r.exercise_id = pe.exercise_id;
end;
$$;

grant execute on function public.student_contraindication_rules(uuid), public.plan_contraindication_alerts(uuid) to authenticated;
revoke execute on function public.student_contraindication_rules(uuid), public.plan_contraindication_alerts(uuid) from public, anon;
