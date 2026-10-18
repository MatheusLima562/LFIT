# Início do professor com dados reais — plano (Fase 1: só plano)

> Status: **proposta, aguardando aprovação do dono.** Nada implementado. Regra que continua valendo: **nunca exibir
> número de exemplo como se fosse real** (`app/(app)/page.tsx`, `EXAMPLE_ONLY_METRICS` em `lib/dashboard.ts`).

## 0. Ponto de partida (o que existe hoje)

| Card / bloco | Hoje | Fonte |
|---|---|---|
| Alunos ativos (tile) | **real** | `organization_plan_usage` (ocupam vaga: `active` + `blocked`) |
| Plano | **real** | `organization_plan_usage` |
| Acompanhamento (a vencer / vencidos / sem treino) | **real** | `listStudents` (`?treino=`) |
| Novos alunos (Hoje / 7 / 30 dias, "cadastrado há N dias") | **real** | `students.created_at` (ver nota abaixo) |
| Acesso expirando | **real** | `students_with_status.access_expires_at` |
| Treinos registrados, Engajamento, Retenção (tiles) | escondidos (`EXAMPLE_ONLY_METRICS`) | mock em `data/dashboard.ts` |
| Treinos concluídos (hoje), Treinos da semana, Top 5, Satisfação | escondidos (não entram em `cards`) | mock |
| Avaliação física, Vendas | escondidos | módulos "Em breve" |

**Nota sobre "39 / 30 dias" e "cadastrado há N dias":** esses números **já são reais** — vêm de `students.created_at`.
Parecem inventados porque o seed cria todos os alunos no mesmo dia (39 em 7 dias e 39 em 30 dias é coerente: a janela de
30 contém a de 7). **Não proponho mudar o cálculo.** O risco real é outro: na **Importação do MFIT** todos os alunos
importados teriam `created_at` = dia da importação e o card diria "39 novos alunos esta semana". Isso fica registrado
como requisito da Importação (seção 5), não desta fase.

## 1. Definição de cada métrica

Convenções para todos:
- **Dia/semana/mês em `America/Sao_Paulo`** (dia civil; semana segunda–domingo, como `week_streak`).
- **"Treino concluído"** = `workout_sessions.status = 'completed'`, datado por `finished_at`.
- **"Treino registrado"** = qualquer sessão iniciada (`started_at`), em qualquer status: concluída, em andamento ou
  abandonada (calculada por `session_effective_status`, em andamento há mais de 6 h). Mede atividade, inclusive quem
  começou e não terminou.
- Sessões do **modo presencial** (registradas pelo professor) contam igual às do aluno.
- **Alunos excluídos** (`deleted_at`) ficam fora de tudo; inativos/expirados contam no histórico (o treino aconteceu).
- **Variação contra o período anterior:** `(atual − anterior) ÷ anterior`. Com anterior = 0 mostramos "—" (nunca
  "+∞%" nem "+100%" inventado).

| Card | Definição proposta | Concordo com a proposta? |
|---|---|---|
| **Alunos ativos** (tile) | Já existe: alunos que ocupam vaga (`effective_status in ('active','blocked')`) ÷ limite do plano. **Sem mudança.** | Sim. Não é "sessões de treino" — é ocupação do plano; manter igual à barra lateral. |
| **Treinos registrados** (tile) | Sessões iniciadas nos **últimos 30 dias** (hoje inclusive, 30 dias civis). Variação contra os 30 dias anteriores (dias 31–60). | Sim. |
| **Treinos concluídos** (card) | Lista das sessões **concluídas hoje** (aluno, divisão "A · Peito", hora). Número no topo = total de hoje; variação contra **o mesmo dia da semana passada** (comparar hoje com ontem engana: segunda × domingo). | Sim, com o ajuste da comparação. |
| **Treinos da semana** (gráfico) | Concluídos por dia (seg–dom) da **semana atual** × **semana passada** × **2 semanas atrás** (formato atual do `WeeklyWorkoutsCard`). Total da semana com variação contra a semana passada **até o mesmo dia** (quarta × quarta). | Sim, com o ajuste "até o mesmo dia" (senão a semana atual sempre perde). |
| **Top 5** | Alunos com mais treinos **concluídos nos últimos 30 dias**; desempate pelo concluído mais recente; mínimo 1 treino. | Sim. |
| **Retenção** (tile) | Base = alunos com ≥ 1 treino concluído nos **dias 31–60**. Retidos = desses, os com ≥ 1 concluído nos **últimos 30 dias**. Retenção = retidos ÷ base. Tooltip com a fórmula. | Sim. **Troca** a fórmula do mock ("ativos ÷ cadastrados"), que mede outra coisa. |
| **Engajamento** (tile) | **Mantenho a fórmula já aprovada no CLAUDE.md:** % de alunos com `effective_status = 'active'` que têm ≥ 1 sessão registrada nos últimos 7 dias. Tooltip com a fórmula. | **Discordo** de "concluídos ÷ prescritos na semana": o plano **não tem frequência semanal** (só `planned_sessions`, total do plano). Derivar "prescritos" de `planned_sessions ÷ semanas` inventa um denominador. Proponho isso como métrica separada, **"Aderência"**, numa fase futura com coluna nova (seção 2). |
| **Satisfação** | **Continua escondido** até haver notas. Fonte nova (entrega 3.2): `workout_sessions.student_rating` (1–5, opcional, só o aluno grava). Proposta: média das notas dos últimos 30 dias + quantas avaliações, com a distribuição 1–5; menos de 3 notas → "Poucas avaliações ainda". | Sim. `rpe` é **esforço** (1–10), não satisfação — continua fora. |
| **Avaliação física** | Continua escondido (módulo "Em breve"). | Sim. |
| **Vendas** | Continua escondido (módulo "Em breve", C8). | Sim. |

## 2. Origem dos dados

| Métrica | Tabelas/colunas | Já existe? |
|---|---|---|
| Treinos registrados | `workout_sessions.started_at`, `student_id` | ✅ |
| Treinos concluídos (hoje) | `workout_sessions.status`, `finished_at`, `workout_label`, `workout_name`; `students.first_name/last_name` | ✅ |
| Treinos da semana | `workout_sessions.finished_at` (status `completed`) | ✅ |
| Top 5 | `workout_sessions` + `students` (nome, foto) | ✅ |
| Retenção | `workout_sessions.finished_at` (60 dias) | ✅ — mas o histórico só começa no lançamento do app do aluno (ver Riscos) |
| Engajamento | `students_with_status.effective_status` + `workout_sessions.started_at` | ✅ |
| Acesso (quem vê o quê) | `private.can_access_student`, `profiles.role` | ✅ |

**Fora desta fase (não existe; listado para decisão futura):**
1. **Frequência semanal prescrita** (`training_plans.weekly_frequency`, 1–7) — base da métrica "Aderência"
   (concluídos ÷ prescritos). Precisa de campo no montador e regra para planos sem frequência.
2. ~~Nota de satisfação do aluno~~ — **feita na entrega 3.2** (`workout_sessions.student_rating`, migration
   `20261017120000`); falta só a RPC agregada do card (nova linha na migration 2 abaixo).
3. **Data de entrada original do aluno** (ex.: `students.enrolled_on`) para a Importação do MFIT não inflar "Novos alunos".
4. Avaliação física e Vendas: módulos inteiros.

## 3. Acesso e LGPD

- **Owner:** organização inteira. **Professor:** só alunos de `private.can_access_student` (os de que é responsável).
  Professor *do plano* sem acesso ao aluno **não** entra (mesma regra do chat: tudo-ou-nada por aluno).
- **Por que RPC `security definer` e não consulta direta:** o RLS de `workout_sessions` só libera leitura para o titular
  ou para staff com `can_view_student_health` (a sessão carrega dor). Uma consulta comum do owner **contaria a menos**
  (alunos de outro professor sem confirmação do titular sumiriam). A RPC conta pelo acesso ao **aluno**
  (`can_access_student`) e devolve só agregados.
- **Nunca sai da RPC:** dor (`session_item_logs.pain_score`, `pain_checkin`), `feedback_note`, `coach_reply`, grupos
  especiais, condições, alertas, triagem. Saída = contagens, datas, nome/foto do aluno, rótulo/nome da divisão.
  Teste com lista fechada de chaves (como `chat-read-until.test.ts`).
- Nada de nome de aluno ou número do dashboard em `audit_logs`/console. Sem auditoria (leitura agregada).

## 4. Desenho técnico

### RPCs (2), ambas `security definer`, `search_path = ''`, `require_staff()` na primeira linha

1. **`get_dashboard_training_stats()`** → `jsonb`
   ```
   { registered_30d, registered_prev_30d,
     completed_today: [{ session_id, student_id, student_name, photo_path, workout_label, workout_name, finished_at }],
     completed_today_count, completed_same_weekday_last_week,
     week: [{ day: 'seg'..'dom', current, one_week_ago, two_weeks_ago }],   -- current nulo nos dias futuros
     week_total, last_week_total_to_date,
     top5: [{ student_id, student_name, photo_path, completed_30d, last_completed_at }] }
   ```
2. **`get_dashboard_engagement_retention()`** → `jsonb`
   ```
   { engagement: { active_students, trained_7d },
     retention: { base_31_60, retained_0_30 },
     history_since: <primeira sessão concluída acessível> }   -- para o estado "dados insuficientes"
   ```
   Separada da 1 porque a fórmula é mais sensível a decisão de produto (pode ir depois sem travar os cards).

Padrão interno das duas: CTE `acc` com os alunos acessíveis (`students` não excluídos da org do chamador, filtrados por
`private.can_access_student(id)` **uma vez por aluno**), depois join com `workout_sessions` por `student_id` e janela
de datas em SP (`private.today_br()` e limites calculados com `at time zone 'America/Sao_Paulo'`). Percentuais
calculados no cliente (o banco devolve numerador e denominador — dá para mostrar "12 de 20" no tooltip).

Documentação: linha nova na tabela "Funções SECURITY DEFINER" do CLAUDE.md (o teste de cobertura cobra);
`tests/db/security-definer.test.ts`: anônimo e aluno recusados nas duas.

### Índices

- `workout_sessions (student_id, finished_at) where status = 'completed'` — concluídos por janela (hoje, semana, 30/60 dias).
- O existente `workout_sessions (student_id, started_at desc)` atende "registrados" e engajamento.

### Custo

Por chamada: 1 passada em `students` da org (`can_access_student` por aluno) + leitura por índice das sessões dos
últimos ~63 dias desses alunos. Ordem de grandeza: 50 alunos × ~3 treinos/semana × 9 semanas ≈ 1.350 linhas; 1.000
alunos ≈ 27 mil linhas — confortável sem cache. A página já é dinâmica (sem cache); duas chamadas em paralelo com as
atuais (`Promise.all`). Revisar com `explain analyze` no lfit-dev com o seed ampliado (seção 6).

### Estado vazio de cada card (nunca número inventado)

| Card | Vazio |
|---|---|
| Treinos registrados | "0" com "nenhum treino nos últimos 30 dias"; variação "—" se o anterior for 0 |
| Treinos concluídos | "Nenhum treino concluído hoje." (lista vazia, total 0) |
| Treinos da semana | Gráfico com zeros + "Nenhum treino concluído nas últimas 3 semanas." |
| Top 5 | "Nenhum treino concluído nos últimos 30 dias." |
| Engajamento | Sem alunos ativos: "—" e "Nenhum aluno ativo". Nunca 0% com denominador 0 |
| Retenção | Base 0 (ninguém treinou nos dias 31–60, ex.: app com menos de 60 dias): **"Dados insuficientes"** + "disponível a partir de dd/mm" (de `history_since`) |
| Satisfação, Avaliação física, Vendas | Continuam fora de `cards` (não aparecem nem em "Personalizar") |

### Front

- `features/dashboard/queries.ts`: `getTrainingStats()`, `getEngagementRetention()` (RPCs acima) → modelos de
  `types/dashboard.ts`; fotos assinadas com `signPhotoUrls` (já usado no chat).
- `app/(app)/page.tsx`: ligar `completed`, `weeklyWorkouts`, `topStudents` em `cards`; remover `treinos-30`,
  `engajamento`, `retencao` de `EXAMPLE_ONLY_METRICS` à medida que cada fonte real entra; tirar os mocks de
  `data/dashboard.ts`/`lib/dashboard.ts` que ficarem sem uso.
- Lógica pura (variação, "—", rótulos, estado "dados insuficientes") em `features/dashboard/` com teste unitário.
- Tutorial: atualizar a seção "Início" de `content/tutoriais/professor/01-tour-pela-interface.md` (+ `updated`) e
  regravar o vídeo `01-visao-geral`.

### Testes

- `tests/db/dashboard-stats.test.ts`: owner vê a org inteira; professor só os seus alunos; owner de outro tenant vê
  zero; aluno e anônimo recusados; sessão às 23:30 de SP cai no dia certo (borda de dia/semana); abandonada conta como
  registrada e não como concluída; aluno excluído fora; Top 5 com desempate; retenção com base 0 → `base_31_60 = 0`;
  **lista fechada de chaves** na saída (nenhum campo de dor/feedback/saúde) e owner sem `can_view_student_health`
  continua contando os treinos do aluno (o caso que a consulta comum erraria).
- Unitários da lógica pura; roteiro e2e `inicio-dados-reais` estendido (cards novos, estados vazios).

## 5. Riscos e o que NÃO vamos fazer

**Riscos**
- **Histórico curto:** o app do aluno ainda não está em produção; nos primeiros 60 dias a Retenção não tem base e os
  percentuais oscilam muito. Mitigação: estado "Dados insuficientes" e "desde dd/mm" no tooltip.
- **Importação do MFIT** não traz histórico de treinos: Retenção/Top 5 começam do zero para alunos importados — e
  sem `enrolled_on` o card "Novos alunos" ficaria inflado (requisito para a etapa da Importação).
- **Roadmap:** Engajamento e Retenção estavam marcados para a 1.6; ligar agora antecipa parte da 1.6 (o job diário de
  expiração continua lá). Confirmar.
- **Cursor de "hoje" no servidor:** os limites de dia usam o relógio do banco em SP (`private.today_br()`), não o do
  navegador — consistente com o resto do app.
- **Sessões registradas pelo professor** inflam "Treinos registrados" se ele iniciar e abandonar sessões de teste;
  aceitável (é atividade real), mas visível no tooltip ("inclui iniciados e não concluídos").

**Não vamos fazer nesta fase**
- Satisfação com RPE, "Aderência" com frequência derivada de `planned_sessions`, qualquer card com valor estimado.
- Avaliação física, Vendas, banner de oferta.
- Cache/materialização (sem necessidade no volume atual).
- Métricas por professor para o owner (ranking de equipe) — Fase 4.
- Exibir dor, feedback ou alertas no Início.

## 6. Migrations necessárias e ordem

| # | Migration (nome proposto) | Resumo |
|---|---|---|
| 1 | `<ts>_dashboard_training_stats.sql` | Índice parcial `workout_sessions (student_id, finished_at) where status = 'completed'` + RPC `get_dashboard_training_stats()` (security definer, `require_staff`, `can_access_student` por aluno), grants |
| 2 | `<ts>_dashboard_engagement_retention.sql` | RPC `get_dashboard_engagement_retention()` (mesmo padrão), grants; inclui o agregado de Satisfação (`student_rating` dos últimos 30 dias: média, total e distribuição 1–5 — só números, nunca a nota de um aluno identificado) |

Fora desta fase (só se aprovado depois): `training_plans_weekly_frequency` (Aderência), `workout_sessions_rating`
(Satisfação), `students_enrolled_on` (Importação do MFIT).

**Ordem de execução proposta**
1. Aprovar este plano (em especial: Engajamento pela fórmula do CLAUDE.md, Satisfação escondida, comparações "mesmo dia").
2. Migration 1 + testes de banco + CLAUDE.md → checkpoint (sem `db push` sem confirmação).
3. Cards Treinos registrados (tile), Treinos concluídos, Treinos da semana e Top 5 + unitários + e2e.
4. Migration 2 + testes → tiles Engajamento e Retenção (com estado "Dados insuficientes").
5. Tutorial e vídeo `01-visao-geral` atualizados; seed ampliado com sessões em datas variadas (60 dias) para o
   `explain analyze` e para o roteiro e2e.
