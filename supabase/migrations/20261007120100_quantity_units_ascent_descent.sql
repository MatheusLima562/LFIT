-- =============================================================================
-- 2.8 (ajuste após reteste) — Unidades "Subida" e "Descida" (contadas em inteiros, como
-- repetições e chegadas). Só os valores do enum aqui: valor novo de enum não pode ser usado
-- na mesma transação; a regra de inteiros vem na migration seguinte.
-- =============================================================================
alter type public.quantity_unit add value if not exists 'ascents';
alter type public.quantity_unit add value if not exists 'descents';
