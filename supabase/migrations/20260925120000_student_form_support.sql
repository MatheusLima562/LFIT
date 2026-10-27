-- =============================================================================
-- Suporte ao modal Novo/Editar aluno (etapa 1.3). Aditiva.
-- =============================================================================

-- A foto só pode apontar para a pasta do próprio aluno: "{organization_id}/{student_id}/...".
alter table public.students
  add constraint students_photo_path_scope
  check (photo_path is null or photo_path like organization_id::text || '/' || id::text || '/%');

-- Solicita anamnese para o aluno (o formulário respondido chega na Fase 3).
create function public.request_anamnesis(p_student_id uuid, p_template_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
  v_id uuid;
begin
  if not exists (
    select 1 from public.anamnesis_templates
    where id = p_template_id and organization_id = s.organization_id
  ) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'template';
  end if;

  insert into public.anamnesis_requests (organization_id, student_id, template_id, requested_by)
  values (s.organization_id, s.id, p_template_id, (select auth.uid()))
  returning id into v_id;

  perform private.audit(s.organization_id, 'student.anamnesis_requested', 'student', s.id);
  return v_id;
end;
$$;

grant execute on function public.request_anamnesis(uuid, uuid) to authenticated;
