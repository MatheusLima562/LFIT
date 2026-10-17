-- =============================================================================
-- 2.12 / entrega 3.2: nota de satisfação do aluno no fim do treino (1 a 5, opcional).
--
-- * `workout_sessions.student_rating` (nulo = não avaliou). Não é dado de saúde, mas segue a regra do conteúdo do
--   aluno: nunca vai para audit_logs, log, URL ou notificação (a RPC não audita e os erros só levam códigos fixos).
-- * Escrita só pela RPC `rate_workout_session`: SOMENTE o aluno dono da sessão (o professor no modo presencial não
--   avalia pelo aluno) e SOMENTE sessão concluída. Pode trocar a nota depois (último valor vale).
-- * Leitura: a mesma do resto da sessão (RLS de workout_sessions — titular ou staff que vê a saúde). O uso no
--   dashboard (card Satisfação) virá por RPC própria, ver docs/planos/dashboard-inicio.md.
-- =============================================================================

alter table public.workout_sessions
  add column student_rating smallint check (student_rating between 1 and 5);

create function public.rate_workout_session(p_session_id uuid, p_rating integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
begin
  -- Primeiro o dono: sessão inexistente ou de outro aluno (inclusive de outra organização) não revela nada.
  select * into w from public.workout_sessions where id = p_session_id;
  if not found or not private.is_own_student(w.student_id) then
    raise exception 'STUDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'rating';
  end if;
  if w.status <> 'completed' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'status';
  end if;

  update public.workout_sessions set student_rating = p_rating where id = w.id;
end;
$$;

revoke execute on function public.rate_workout_session(uuid, integer) from public, anon;
grant execute on function public.rate_workout_session(uuid, integer) to authenticated;
