-- 2.10 Fase B — Índice que cobre a FK (student_id, organization_id) da triagem (Performance Advisor:
-- unindexed_foreign_keys) e a leitura da última triagem do aluno. Substitui o índice (student_id, recorded_at).
-- As FKs recorded_by/clearance_recorded_by ficam de fora, como as demais "*_by" (ver 20261003120000_fk_indexes).
drop index if exists public.student_red_flag_checks_student_idx;
create index student_red_flag_checks_student_org_idx
  on public.student_red_flag_checks (student_id, organization_id, recorded_at desc);
