-- O gatilho de auditoria rodava também na exclusão em cascata da organização e tentava
-- gravar um log apontando para a organização já removida (violação de FK), impedindo
-- apagar organizações. Na cascata não há o que auditar: pula quando a org não existe mais.
create or replace function private.audit_group_or_class_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_members integer;
begin
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return old;
  end if;

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
