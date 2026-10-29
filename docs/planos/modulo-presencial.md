# Módulo presencial — proposta (NÃO implementado)

_Rascunho de 28/10/2026, escrito na sprint autônoma. Só a base entrou no código: a **modalidade do aluno** (consultoria |
presencial | híbrido, migration `20261028120100`), com etiqueta e filtro em Meus alunos. Tudo abaixo depende da sua
aprovação: regras de presença, pacote e cobrança são decisões de negócio._

## Para quem é

- **Consultoria** (padrão): treino pelo app, sem aula marcada — o fluxo atual.
- **Presencial**: aulas com o professor (estúdio ou domicílio). O app serve de registro e de apoio.
- **Híbrido**: aulas presenciais em alguns dias + treino pelo app nos outros.

## Proposta

### 1. Presença
- Tabela `class_attendances` (aluno, data/hora, professor, status `presente | falta | falta_justificada | reposicao`,
  observação curta **sem dado de saúde**). Marcação pelo professor no celular, numa lista do dia.
- Aproveitar a sessão de treino presencial que já existe (`start_workout_session` com `p_student_id`, modo `full`/
  `restricted`): uma aula com treino registrado pode marcar presença sozinha.
- **Decidir:** o aluno vê o histórico de presenças? Falta justificada até quantas horas antes?

### 2. Pacote de aulas
- `class_packages` (aluno, quantidade de aulas, validade, aulas usadas) e consumo a cada presença/falta não justificada.
- Aviso ao professor quando faltam N aulas ou o pacote vence em 7 dias (mesmo padrão dos avisos de vencimento de treino).
- **Sem cobrança nesta proposta**: venda e pagamento do pacote ficam para a C2/Vendas (C8). **Decidir:** falta não
  justificada consome aula? Reposição tem prazo?

### 3. Treino complementar nos dias sem aula (híbrido)
- Plano normal do aluno (o montador já serve), com divisões marcadas como "app" para os dias sem aula. O "Treino do dia"
  sugere só as divisões do app quando há aula marcada no dia.
- **Decidir:** o complementar é obrigatório no híbrido? Conta na constância?

### 4. Aluno em risco
- Sinais calculados (nunca gravados como rótulo): faltas seguidas, queda de frequência contra a média das últimas 4
  semanas, pacote acabando sem renovação, sem treino no app há X dias (híbrido/consultoria).
- Lista "Alunos em risco" no Início, com o motivo **sem dado de saúde** ("3 faltas seguidas", "pacote vence em 5 dias").
- **Decidir:** limiares (quantas faltas? quantos dias?).

## Riscos

- **Cobrança disfarçada:** pacote de aulas vira controle financeiro rápido. Manter fora até a C2 (gateway, recibos,
  inadimplência) para não criar duas fontes de verdade de pagamento.
- **Dado de saúde em observação de presença** ("faltou por dor no joelho"): campo curto com aviso e nunca exibido ao
  aluno nem em notificação; melhor ainda, sem campo livre na 1ª versão.
- **Fuso e agenda:** aula às 23h em SP cai no dia seguinte em UTC — usar as funções de dia de SP que o Início já usa
  (`private.sp_day`), e lembrar do backlog de fuso por organização.
- **Professor do plano × responsável:** quem marca presença? Proposta: quem dá a aula, com acesso mínimo (como o
  professor do plano hoje), sem ver a saúde.
- **Multi-vínculo (C1):** aluno com dois personais (dois estúdios) — presença e pacote são por organização; não misturar.
- **LGPD:** frequência não é dado de saúde, mas revela rotina; exportação do titular e exclusão definitiva precisam
  incluir as tabelas novas.

## Ordem sugerida (depois da sua aprovação)

1. Presença (registro manual) → 2. Aluno em risco (só com presença e treino) → 3. Pacote de aulas sem cobrança →
4. Treino complementar no híbrido.
