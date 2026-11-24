-- Correção achada na ETAPA 2 da sprint de edição (investigação do seed): apagar uma organização falhava quando ela tinha
-- exercício PRÓPRIO usado num treino. `plan_workout_items.exercise_id` e `plan_item_substitutes.exercise_id` eram
-- ON DELETE RESTRICT (checagem IMEDIATA): na cascata da organização, o exercício podia ser apagado antes do item que o
-- usa → erro 23503 e nada era apagado. Por isso a limpeza dos testes deixava organizações para trás (133 no lfit-dev).
--
-- NO ACTION mantém a MESMA proteção (não dá para apagar um exercício em uso: o banco confere no fim do comando, mesmo
-- erro 23503), mas a cascata da organização passa, porque no fim do comando os itens também já foram apagados.

alter table public.plan_workout_items
  drop constraint plan_workout_items_exercise_id_fkey,
  add constraint plan_workout_items_exercise_id_fkey
    foreign key (exercise_id) references public.exercises (id) on delete no action;

alter table public.plan_item_substitutes
  drop constraint plan_item_substitutes_exercise_id_fkey,
  add constraint plan_item_substitutes_exercise_id_fkey
    foreign key (exercise_id) references public.exercises (id) on delete no action;
