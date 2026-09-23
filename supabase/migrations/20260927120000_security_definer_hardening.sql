-- =============================================================================
-- Endurecimento das funções SECURITY DEFINER (auditoria do Security Advisor).
-- =============================================================================

-- 1) student_effective_status recebia uma LINHA como argumento e, sendo DEFINER,
--    lia payments sem RLS: um usuário logado podia montar uma linha com o id de um
--    aluno de outra organização e descobrir se havia pagamento vencido.
--    Como INVOKER, o RLS de payments/organizations do chamador se aplica. A view
--    students_with_status (security_invoker) já roda com o chamador; as funções
--    DEFINER que a usam (limite do plano) continuam com o privilégio do dono.
create or replace function public.student_effective_status(s public.students)
returns public.effective_status
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when s.access_expires_at is not null and s.access_expires_at <= now()
      then 'expired'
    when s.status = 'inactive'
      then 'inactive'
    when s.block_if_overdue and exists (
      select 1
      from public.payments p
      join public.organizations o on o.id = p.organization_id
      where p.student_id = s.id
        and p.status = 'pending'
        and p.due_date + o.overdue_grace_days < private.today_br()
    )
      then 'blocked'
    else 'active'
  end::public.effective_status
$$;

-- 2) REVOKE explícito (defesa em profundidade): nenhuma função SECURITY DEFINER
--    é executável por PUBLIC ou anon, independentemente dos privilégios padrão
--    do projeto. Os grants a authenticated/service_role continuam os das
--    migrations anteriores.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and n.nspname in ('public', 'private')
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end;
$$;
