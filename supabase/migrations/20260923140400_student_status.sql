-- =============================================================================
-- Status efetivo do aluno — fonte única da verdade (nunca armazenado).
--
--   expired   se access_expires_at <= now()
--   inactive  senão, se status = 'inactive'
--   blocked   senão, se block_if_overdue e existe pagamento pendente com
--             due_date + organizations.overdue_grace_days < hoje (America/Sao_Paulo)
--   active    caso contrário
--
-- Limite do plano: ocupam vaga os alunos com status efetivo active OU blocked.
-- =============================================================================

-- security definer para que o resultado seja o mesmo para qualquer chamador
-- (só devolve um enum; não expõe os pagamentos).
create function public.student_effective_status(s public.students)
returns public.effective_status
language sql
stable
security definer
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

create function private.occupies_seat(s public.students)
returns boolean
language sql
stable
set search_path = ''
as $$
  select s.deleted_at is null
     and public.student_effective_status(s) in ('active', 'blocked')
$$;

-- Listagem, busca e contadores usam esta view (respeita o RLS de quem consulta).
create view public.students_with_status
with (security_invoker = true)
as
select
  s.*,
  public.student_effective_status(s) as effective_status,
  s.first_name || ' ' || s.last_name as full_name,
  private.immutable_unaccent(lower(s.first_name || ' ' || s.last_name || ' ' || s.email)) as search_text
from public.students s
where s.deleted_at is null;

-- Contagem das abas (Ativos inclui bloqueados), no escopo visível ao usuário.
create function public.student_tab_counts()
returns table (active bigint, inactive bigint, expired bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where effective_status in ('active', 'blocked')),
    count(*) filter (where effective_status = 'inactive'),
    count(*) filter (where effective_status = 'expired')
  from public.students_with_status
$$;

-- Uso do plano é sempre da organização inteira (também para trainers).
create function public.organization_plan_usage()
returns table (plan public.plan_tier, student_limit integer, used bigint, remaining bigint, inactive bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.plan,
    o.student_limit,
    count(s.id) filter (where private.occupies_seat(s)),
    greatest(o.student_limit - count(s.id) filter (where private.occupies_seat(s)), 0),
    count(s.id) filter (where s.deleted_at is null and public.student_effective_status(s) = 'inactive')
  from public.organizations o
  left join public.students s on s.organization_id = o.id
  where o.id = private.current_org_id()
    and private.is_staff()
  group by o.id
$$;

grant execute on function public.student_effective_status(public.students) to authenticated, service_role;
grant execute on function private.occupies_seat(public.students) to authenticated, service_role;
grant select on public.students_with_status to authenticated;
grant execute on function public.student_tab_counts() to authenticated;
grant execute on function public.organization_plan_usage() to authenticated;
