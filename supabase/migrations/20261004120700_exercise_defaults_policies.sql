-- 2.8 — Performance Advisor (multiple_permissive_policies): a política "for all" também valia
-- para SELECT, duplicando a de leitura. Mesma regra, separada por comando.
drop policy exercise_defaults_write on public.exercise_defaults;

create function private.can_write_exercise_defaults(p_exercise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() and exists (
    select 1 from public.exercises e
    where e.id = p_exercise_id
      and (e.organization_id is null or e.organization_id = private.current_org_id())
      and (e.organization_id is null or private.is_owner() or e.created_by = (select auth.uid()))
  )
$$;
grant execute on function private.can_write_exercise_defaults(uuid) to authenticated;
revoke execute on function private.can_write_exercise_defaults(uuid) from public, anon;

create policy exercise_defaults_insert on public.exercise_defaults for insert to authenticated
  with check (organization_id = (select private.current_org_id()) and private.can_write_exercise_defaults(exercise_id));
create policy exercise_defaults_update on public.exercise_defaults for update to authenticated
  using (organization_id = (select private.current_org_id()) and private.can_write_exercise_defaults(exercise_id))
  with check (organization_id = (select private.current_org_id()) and private.can_write_exercise_defaults(exercise_id));
create policy exercise_defaults_delete on public.exercise_defaults for delete to authenticated
  using (organization_id = (select private.current_org_id()) and private.can_write_exercise_defaults(exercise_id));
