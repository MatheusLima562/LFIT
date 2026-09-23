-- =============================================================================
-- 1.5 Grupos especiais e turmas: auditoria de exclusões.
-- Excluir um grupo especial remove dado de saúde de todos os seus alunos.
-- =============================================================================

create function private.audit_group_or_class_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_members integer;
begin
  if tg_table_name = 'special_groups' then
    select count(*) into v_members from public.student_groups where group_id = old.id;
    perform private.audit(old.organization_id, 'special_group.deleted', 'special_group', old.id,
      jsonb_build_object('name', old.name, 'students', v_members));
  else
    select count(*) into v_members from public.class_students where class_id = old.id;
    perform private.audit(old.organization_id, 'class.deleted', 'class', old.id,
      jsonb_build_object('name', old.name, 'students', v_members));
  end if;
  return old;
end;
$$;

revoke execute on function private.audit_group_or_class_delete() from public, anon;

create trigger special_groups_audit_delete
before delete on public.special_groups
for each row execute function private.audit_group_or_class_delete();

create trigger classes_audit_delete
before delete on public.classes
for each row execute function private.audit_group_or_class_delete();
