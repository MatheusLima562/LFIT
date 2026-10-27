-- 2.8 — Disparo manual do job de agendados (operação/testes). Só service_role.
create function public.admin_activate_due_plans()
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.activate_due_plans()
$$;
revoke execute on function public.admin_activate_due_plans() from public, anon, authenticated;
grant execute on function public.admin_activate_due_plans() to service_role;
