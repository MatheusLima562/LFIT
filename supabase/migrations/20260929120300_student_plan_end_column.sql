-- =============================================================================
-- Fase 2 — Vencimento do plano de treino ativo no cadastro do aluno.
-- Alimentado exclusivamente pelo gatilho private.sync_student_plan_end
-- (training_plans). Usado para "treino a vencer / vencido / sem treino".
-- Alunos não têm grant de escrita direta em students (só via RPC).
-- =============================================================================

alter table public.students add column workout_plan_ends_at timestamptz;

create index students_workout_plan_ends_at_idx on public.students (organization_id, workout_plan_ends_at)
  where deleted_at is null;
