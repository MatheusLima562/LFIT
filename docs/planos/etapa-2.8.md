# Etapa 2.8 — Ajustes do montador (PENDENTE)

**Quando:** depois da 2.6 (impressão) e da 2.7 (verificação), **antes da C1**. Entrar em modo de planejamento,
mostrar o plano, checkpoint após o banco, commit por item, parar ao final para teste.

## Decisões já tomadas
- **Professor do plano** diferente do responsável pelo aluno: **vê e edita só aquele plano** (e o nome do aluno);
  não vê o cadastro, outros planos nem dados de saúde (sem consentimento do titular, alertas ocultos).
- **Plano agendado** vira ativo por **job diário no banco (pg_cron, 00:05 São Paulo)**; até o job rodar, as telas
  calculam pela data. `pg_cron` está disponível no lfit-dev, ainda não instalado.
- **Resumo do item e séries detalhadas usam os mesmos campos** de prescrição (unidade, intensidade, velocidade, pausa).

## Escopo pedido
1. **Plano:** toggle "sem data de expiração" (não entra em A vencer/Vencidos; sugestão: `workout_plan_ends_at = 'infinity'`
   para não confundir com "Sem treino"); total de sessões previstas (Fase 3: "X de Y", vence por sessões ou data);
   professor responsável pelo plano (padrão: o do aluno); status "agendado" + abas Atuais / Futuros / Anteriores com contagem.
2. **Exercício no plano:** até 3 substitutos por item (também passam pelo alerta); Método e Objetivo opcionais de listas
   configuráveis por organização (valores iniciais: métodos — tradicional, drop-set, rest-pause, cluster, isométrico,
   excêntrico enfatizado, pré-exaustão, balístico, FNP, alongamento ativo, alongamento passivo; objetivos — aquecimento,
   ativação, força, hipertrofia, resistência, mobilidade, flexibilidade, correção postural, pré-treino, pós-treino);
   dica com negrito e lista, sanitizada no servidor (sem HTML).
3. **Série:** unidade por série (repetições, até a falha, segundos, minutos, metros, km, chegadas) mudando rótulo e
   validação; intensidade %1RM / RPE / RIR (substitui "RPE alvo" — migrar dados); velocidade por preset (lenta,
   moderada, rápida, explosiva) OU cadência "3010" (exclusivos); pausa mín–máx; menu da série (duplicar, remover,
   mover); limite de 20 séries.
4. **Produtividade:** "+ Rápido" com valores padrão do exercício (criar padrões séries/reps/descanso na biblioteca,
   editáveis pelo personal — camada da org para exercícios globais); "Importar exercícios" de outra divisão, de outro
   plano do aluno ou de um modelo (mantendo grupos e séries); "Expandir/recolher todos"; "Copiar treino para alunos"
   (vários alunos, rascunho ou ativar, resumo de alertas por aluno antes de confirmar; um alerta não bloqueia os outros).
5. **Regras:** migrations aditivas com dry-run; RPCs novas pelo checklist SECURITY DEFINER; testes de isolamento
   (org, trainer, aluno, anon); alertas não bloqueantes. A impressão (2.6) precisa exibir os campos novos.

## Esboço técnico (a detalhar no planejamento)
- `training_plans`: status `scheduled`, `no_end`, `planned_sessions`, `trainer_id`; `can_access_plan`/`lock_editable_plan`
  aceitam o professor do plano; `activate_scheduled_plans()` agendada no pg_cron; checagem de sobreposição de agendados.
- Prescrição comum (item e série): `quantity_unit`, `quantity_min/max`, `quantity_note` (ex.: "por lado"),
  `intensity_type/value`, `speed` × `tempo`, `rest_min/max`. Migração: "8–12" → 8/12; "até a falha" → unidade;
  texto não reconhecido → `quantity_note`; `rpe_target` → intensidade RPE. Colunas antigas mantidas (aditivo).
- `plan_item_substitutes` (≤ 3); `training_methods`/`training_objectives` por org (semeadas por gatilho + backfill);
  `exercise_defaults` (camada global + da org).
- RPCs: `apply_plan_to_students` (por aluno com bloco de exceção; retorna resultado de cada um) e prévia de alertas.
