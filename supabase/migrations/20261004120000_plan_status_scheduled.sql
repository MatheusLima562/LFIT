-- 2.8 — Status "agendado" (plano com início futuro). Arquivo próprio: um valor novo de enum
-- não pode ser usado na mesma transação em que foi criado.
alter type public.plan_status add value if not exists 'scheduled' before 'archived';
