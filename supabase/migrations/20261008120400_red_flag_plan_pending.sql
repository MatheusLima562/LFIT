-- =============================================================================
-- 2.10 Fase B — Aviso restrito da triagem para o professor do plano (sem acesso ao aluno/saúde).
-- Devolve SÓ um booleano: a última triagem do aluno do plano tem sinais e ainda não tem liberação.
-- Nenhum sinal, observação, encaminhamento ou dado da liberação sai daqui. Modelo (sem aluno) → false.
-- =============================================================================
create function public.plan_red_flag_pending(p_plan_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.training_plans;
begin
  perform private.require_staff();
  p := private.get_readable_plan(p_plan_id);
  if p.student_id is null then
    return false;
  end if;
  return coalesce((
    select cardinality(c.items) > 0 and c.clearance_recorded_at is null
    from public.student_red_flag_checks c
    where c.student_id = p.student_id and c.organization_id = p.organization_id
    order by c.recorded_at desc
    limit 1
  ), false);
end;
$$;

revoke execute on function public.plan_red_flag_pending(uuid) from public, anon;
grant execute on function public.plan_red_flag_pending(uuid) to authenticated;
