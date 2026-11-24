-- Complemento de 20261124160000 (já aplicada): NO ACTION não bastou. Dentro da cascata da organização o Postgres
-- confere cada passo interno ao fim DAQUELE passo (exercícios apagados antes dos itens → 23503). Com a checagem adiada
-- para o fim da transação (DEFERRABLE INITIALLY DEFERRED), a cascata termina (itens e exercícios saem juntos) e a
-- proteção continua: apagar um exercício em uso sozinho falha no fim da transação com o mesmo erro 23503 (o app já trata
-- esse código em `deleteExercise`: "Este exercício está em treinos…").

alter table public.plan_workout_items
  alter constraint plan_workout_items_exercise_id_fkey deferrable initially deferred;

alter table public.plan_item_substitutes
  alter constraint plan_item_substitutes_exercise_id_fkey deferrable initially deferred;
