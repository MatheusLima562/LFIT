-- =============================================================================
-- Fase 2.5 — Filtros de treino em "Meus alunos" (A vencer / Vencidos / Sem treino).
-- A view students_with_status expandiu s.* quando foi criada; para expor a nova
-- coluna workout_plan_ends_at ela precisa ser recriada (mesma definição).
-- =============================================================================

drop view public.students_with_status;

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

grant select on public.students_with_status to authenticated;

-- Contagem dos filtros de treino entre os alunos da aba Ativos (escopo visível ao usuário).
-- "A vencer" = vence nos próximos 7 dias; "Vencido" = plano ativo com fim no passado.
create function public.student_plan_counts()
returns table (expiring bigint, expired bigint, no_plan bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where workout_plan_ends_at >= now() and workout_plan_ends_at < now() + interval '7 days'),
    count(*) filter (where workout_plan_ends_at < now()),
    count(*) filter (where workout_plan_ends_at is null)
  from public.students_with_status
  where effective_status in ('active', 'blocked')
$$;

revoke execute on function public.student_plan_counts() from public, anon;
grant execute on function public.student_plan_counts() to authenticated;
