-- =============================================================================
-- Suporte à tela "Meus alunos" (etapa 1.2). Somente funções novas.
-- =============================================================================

-- Autoriza (mesma regra de acesso ao aluno) e audita o envio de convite /
-- recuperação de acesso. O servidor chama esta RPC com a sessão do usuário
-- ANTES de usar a secret key no Auth admin — assim a permissão continua
-- decidida pelo banco.
create function public.record_student_access_email(p_student_id uuid)
returns table (student_id uuid, organization_id uuid, user_id uuid, email text, first_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
begin
  perform private.audit(s.organization_id, 'student.invite_sent', 'student', s.id);
  return query select s.id, s.organization_id, s.user_id, s.email, s.first_name;
end;
$$;

-- Auditoria de exportação (quantidade e filtros; nenhum dado pessoal).
create function public.log_students_export(p_format text, p_count integer, p_filters jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
begin
  if p_format not in ('csv', 'xlsx') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  perform private.audit(v_org, 'students.exported', 'student', null, jsonb_build_object(
    'format', p_format,
    'count', p_count,
    'filters', coalesce(p_filters, '{}'::jsonb)
  ));
end;
$$;

grant execute on function
  public.record_student_access_email(uuid),
  public.log_students_export(text, integer, jsonb)
to authenticated;
