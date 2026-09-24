-- =============================================================================
-- 2.8 — (1) Alertas "restritos" para o professor do plano sem acesso à saúde do aluno:
--           só o NÍVEL por exercício (evitar/cautela) + texto genérico na interface.
--           Nada de condição, grupo ou nota. Owner sem consentimento do titular continua
--           recebendo só "hidden" (regra LGPD da 1.4).
--       (2) organizations.is_seed: o seed --reset só apaga organizações marcadas.
-- =============================================================================

alter table public.organizations add column is_seed boolean not null default false;
update public.organizations set is_seed = true where slug = 'studio-exemplo';
-- Sem grant de escrita para authenticated (só service_role muda).

-- O usuário atual é professor de algum plano deste aluno, mas não acessa o aluno?
create function private.is_restricted_plan_viewer(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff()
    and not private.can_access_student(p_student_id)
    and exists (
      select 1 from public.training_plans t
      where t.student_id = p_student_id
        and t.organization_id = private.current_org_id()
        and t.trainer_id = (select auth.uid())
    )
$$;

drop function public.plan_contraindication_alerts(uuid);
drop function public.student_contraindication_rules(uuid);

create function public.student_contraindication_rules(p_student_id uuid)
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

  if private.is_restricted_plan_viewer(p_student_id) then
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

create function public.plan_contraindication_alerts(p_plan_id uuid)
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
  if not private.can_view_student_health(p.student_id) and not private.is_restricted_plan_viewer(p.student_id) then
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

grant execute on function public.student_contraindication_rules(uuid), public.plan_contraindication_alerts(uuid) to authenticated;
grant execute on function private.is_restricted_plan_viewer(uuid) to authenticated;
revoke execute on function public.student_contraindication_rules(uuid), public.plan_contraindication_alerts(uuid) from public, anon;
revoke execute on function private.is_restricted_plan_viewer(uuid) from public, anon;
