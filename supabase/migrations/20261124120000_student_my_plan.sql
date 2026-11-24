-- Sprint edição rápida, PARTE 0: bloco "Meu plano" no Perfil do app do aluno.
--
-- * Só o próprio aluno (sessão dele, cadastro ativo) recebe os dados — nunca outro aluno, nunca histórico financeiro.
-- * "Plano" = o plano de treino ATIVO do cadastro (nome, início, vencimento ou "sem vencimento"). O sistema não tem
--   tipo de plano comercial (mensal, trimestral…): nada é inventado (docs/decisoes-autonomas.md).
-- * Valor em aberto: só o PRÓXIMO pagamento pendente (o de vencimento mais antigo ainda não pago): valor e data.
-- * Datas calculadas no fuso da conta (private.today_br lê o fuso de quem chama).

create function public.get_my_plan_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.students;
  p public.training_plans;
  v_pay record;
begin
  select * into s from public.students where user_id = (select auth.uid()) and deleted_at is null;
  if not found then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.student_effective_status(s) <> 'active' then
    return null;
  end if;

  select * into p from public.training_plans tp
  where tp.student_id = s.id and tp.status = 'active'
  order by tp.starts_on desc nulls last, tp.activated_at desc nulls last
  limit 1;
  if not found then
    return null;
  end if;

  select pm.amount_cents, pm.due_date into v_pay
  from public.payments pm
  where pm.student_id = s.id and pm.status = 'pending'
  order by pm.due_date, pm.id
  limit 1;

  return jsonb_build_object(
    'name', p.name,
    'starts_on', p.starts_on,
    'ends_on', case when p.no_end then null else p.ends_on end,
    'no_end', p.no_end,
    'today', private.today_br(),
    'next_payment', case when v_pay.due_date is null then null
                         else jsonb_build_object('amount_cents', v_pay.amount_cents, 'due_date', v_pay.due_date) end
  );
end;
$$;

revoke execute on function public.get_my_plan_summary() from public, anon;
grant execute on function public.get_my_plan_summary() to authenticated;
