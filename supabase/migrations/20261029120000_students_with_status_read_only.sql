-- students_with_status: só leitura, só para usuários logados.
-- A view é "auto-atualizável" (select simples sobre students): um INSERT/UPDATE/DELETE nela vira escrita em students.
-- Hoje ninguém escreve por ela (authenticated só tem SELECT; o RLS e a falta de grant em students já barram), mas os
-- privilégios padrão do Supabase deram escrita ao service_role ao recriá-la em 20261028120100. Aqui os grants ficam
-- explícitos e mínimos, para não depender de privilégio padrão em recriações futuras da view:
--   anon/public: nada · authenticated: SELECT · service_role: SELECT (scripts e testes só leem).
-- Escrita em alunos continua só pelas RPCs (create_student, update_student, set_student_modality...).

revoke all on public.students_with_status from public, anon, authenticated, service_role;
grant select on public.students_with_status to authenticated, service_role;

-- Defesa extra: mesmo que um grant de escrita volte por engano, a view recusa qualquer escrita.
create function private.students_with_status_read_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'READ_ONLY_VIEW' using errcode = '42501';
end;
$$;

create trigger students_with_status_read_only
  instead of insert or update or delete on public.students_with_status
  for each row execute function private.students_with_status_read_only();
