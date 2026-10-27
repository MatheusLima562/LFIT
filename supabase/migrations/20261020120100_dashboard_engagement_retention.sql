-- =============================================================================
-- Início com dados reais (docs/planos/dashboard-inicio.md, aprovado 20/10/2026) — migration 2: engajamento, retenção
-- e satisfação. Mesmo padrão da migration 1 (acesso ao aluno, dias em São Paulo, só números).
--
-- * Engajamento (fórmula do CLAUDE.md): alunos com status efetivo 'active' que têm ≥ 1 sessão registrada nos últimos
--   7 dias civis (hoje inclusive) ÷ alunos com status efetivo 'active'.
-- * Retenção: base = alunos com ≥ 1 treino concluído nos dias 31–60; retidos = desses, os com ≥ 1 concluído nos
--   últimos 30 dias. Base 0 (ex.: app com menos de 60 dias) → a tela mostra "Dados insuficientes" (history_since).
-- * Satisfação: média de workout_sessions.student_rating (1–5) das sessões concluídas nos últimos 30 dias, com a
--   quantidade de notas e a distribuição. Nunca a nota de um aluno identificado.
-- =============================================================================

create function public.get_dashboard_engagement_retention()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
  v_today date := private.today_br();
  v_result jsonb;
begin
  with acc as (
    select * from private.dashboard_students()
  ),
  eff as (
    select s.id, public.student_effective_status(s) as status
    from public.students s
    join acc on acc.id = s.id
  ),
  started_7d as (
    select distinct ws.student_id
    from public.workout_sessions ws
    join acc on acc.id = ws.student_id
    where ws.started_at >= private.sp_day_start(v_today - 6)
  ),
  done_60d as (
    select ws.student_id, private.sp_day(ws.finished_at) as day, ws.student_rating
    from public.workout_sessions ws
    join acc on acc.id = ws.student_id
    where ws.status = 'completed' and ws.finished_at >= private.sp_day_start(v_today - 59)
  ),
  base as (
    select distinct student_id from done_60d where day <= v_today - 30
  ),
  recent as (
    select distinct student_id from done_60d where day >= v_today - 29
  ),
  rated as (
    select student_rating as r from done_60d where day >= v_today - 29 and student_rating is not null
  )
  select jsonb_build_object(
    'today', v_today,
    'engagement', jsonb_build_object(
      'active_students', (select count(*) from eff where eff.status = 'active'),
      'trained_7d', (select count(*) from eff join started_7d on started_7d.student_id = eff.id where eff.status = 'active')
    ),
    'retention', jsonb_build_object(
      'base_31_60', (select count(*) from base),
      'retained_0_30', (select count(*) from base join recent using (student_id))
    ),
    -- Primeiro dia com treino concluído (para "Retenção disponível a partir de dd/mm").
    'history_since', (
      select min(private.sp_day(ws.finished_at))
      from public.workout_sessions ws
      join acc on acc.id = ws.student_id
      where ws.status = 'completed'
    ),
    'satisfaction', jsonb_build_object(
      'ratings', (select count(*) from rated),
      'average', (select round(avg(r)::numeric, 2) from rated),
      'distribution', (
        select jsonb_agg(jsonb_build_object('stars', g.i, 'count', (select count(*) from rated where r = g.i)) order by g.i desc)
        from generate_series(1, 5) as g(i)
      )
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.get_dashboard_engagement_retention() from public, anon;
grant execute on function public.get_dashboard_engagement_retention() to authenticated;
