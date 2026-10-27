-- =============================================================================
-- 2.7 — Índices para chaves estrangeiras usadas em junções e exclusões em cascata
-- (Performance Advisor: unindexed_foreign_keys). As FKs "created_by"/"reviewed_by"
-- ficam de fora: só são tocadas quando um usuário é removido (raro).
-- =============================================================================
create index if not exists plan_workouts_plan_org_idx on public.plan_workouts (plan_id, organization_id);
create index if not exists plan_workout_items_workout_org_idx on public.plan_workout_items (workout_id, organization_id);
create index if not exists plan_item_sets_item_org_idx on public.plan_item_sets (item_id, organization_id);
create index if not exists training_plans_student_org_idx on public.training_plans (student_id, organization_id);
create index if not exists training_plans_source_idx on public.training_plans (source_plan_id);
create index if not exists special_group_conditions_group_org_idx on public.special_group_conditions (group_id, organization_id);
create index if not exists exercise_contraindications_condition_idx on public.exercise_contraindications (condition_id);
create index if not exists exercise_contraindications_org_idx on public.exercise_contraindications (organization_id);
create index if not exists exercises_source_idx on public.exercises (source_exercise_id);
create index if not exists health_conditions_org_idx on public.health_conditions (organization_id);
create index if not exists student_groups_student_org_idx on public.student_groups (student_id, organization_id);
create index if not exists student_groups_group_org_idx on public.student_groups (group_id, organization_id);
create index if not exists class_students_class_org_idx on public.class_students (class_id, organization_id);
create index if not exists class_students_student_org_idx on public.class_students (student_id, organization_id);
create index if not exists classes_trainer_org_idx on public.classes (trainer_id, organization_id);
create index if not exists students_trainer_org_idx on public.students (trainer_id, organization_id);
create index if not exists payments_student_org_idx on public.payments (student_id, organization_id);
create index if not exists access_links_student_org_idx on public.access_links (student_id, organization_id);
create index if not exists anamnesis_requests_student_org_idx on public.anamnesis_requests (student_id, organization_id);
create index if not exists anamnesis_requests_template_org_idx on public.anamnesis_requests (template_id, organization_id);
create index if not exists anamnesis_templates_org_idx on public.anamnesis_templates (organization_id);
create index if not exists pending_signups_link_org_idx on public.pending_signups (link_id, organization_id);
create index if not exists pending_signups_student_idx on public.pending_signups (student_id);
