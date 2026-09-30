# Próximos passos (retomada)

_Atualizado em 30/09/2026 (Fase B da 2.10 aprovada no teste do dono)._

## Etapa atual
**Fase 2 — Treinos e exercícios.** 2.1 a 2.7 concluídas. 2.8 completa (aguardando seu novo teste). **2.10 Fase B
aprovada** no seu teste manual (Guias, alertas, triagem, liberação, Guia da hérnia) — 4 ajustes entraram no caminho
(ver "Falta" → item 4). Dashboard "Início" com dados reais nos cards possíveis hoje. Suíte de roteiros de
navegador em `e2e/` (27 roteiros, `npm run test:e2e`). **Ajuste de cores concluído** (marca × semântica,
contraste AA, validação para o white label) — commit `6ab389e`, **parado para sua revisão** com screenshots
antes/depois. **Auditoria de segurança entregue** (abaixo) — parada para sua revisão, sem prazo (2.11 foi para depois da Fase 3).
Plano do app do aluno (C1 + Fase 3 + lado do professor + pré-requisitos) em andamento — ver item 5 de "Falta".

## Pendências de segurança registradas (feitas; aguardando sua revisão)
1. **Teste automático de cobertura** — `tests/db/security-definer-coverage.test.ts`: lista as funções
   `SECURITY DEFINER` do schema `public` (via `pg_proc`, usando `supabase db query --linked` — nada de conexão
   direta nem função nova no banco) e falha se alguma não estiver na tabela do CLAUDE.md, ou se o CLAUDE.md citar
   uma função que não existe mais. Hoje: 40 funções, todas já documentadas (o teste passa sem alterar nada).
2. **Auditoria de candidatas a `SECURITY INVOKER`** — `docs/planos/auditoria-security-definer.md`. Resultado: só
   `public.can_view_student_health` é uma candidata segura (é um repasse de 1 linha para `private.can_view_student_health`,
   que já é `SECURITY DEFINER` e já tem `grant` para `authenticated`; virar `INVOKER` não muda nada do que a função
   enxerga). `organization_plan_usage` parece candidata mas **não é seguro mudar como está**: hoje conta alunos da
   organização inteira ignorando o RLS de `students`; virar `INVOKER` faria o contador de vagas ficar errado para
   quem não é owner (RLS de `students` só mostra os alunos do próprio trainer). As demais 38 seguem `DEFINER` por
   motivo concreto (escrita em tabela sem grant para `authenticated`, principalmente `audit_logs` — "ninguém escreve
   diretamente" — ou bypass intencional de RLS para o professor do plano). **Nenhuma mudança aplicada**; só a lista.

## Concluído (branch `feat/fase-2-treinos`)
- 2.1 Banco: biblioteca global (52 exercícios), 11 condições, planos/divisões/itens/séries, RPCs e alertas.
- Trava do seed: só roda no lfit-dev (`scripts/dev-guard.mts`).
- 2.2 Biblioteca de exercícios (`/treinos/exercicios`) — busca, filtros, personalizar, contraindicações da equipe.
- 2.3 Condições (`/treinos/condicoes`) e vínculo grupo especial ↔ condição.
- 2.4 Montador (`/treinos/novo`, `/treinos/[id]/editar`) — divisões, arrastar/soltar + teclado, agrupamentos,
  séries detalhadas, alertas ao vivo.
- 2.5 Treinos do aluno, modelos prontos, visão geral e filtros "A vencer / Vencidos / Sem treino" em Meus alunos.
- Vídeo próprio (MP4/WebM) nos exercícios, com compressão no navegador, bucket privado e cota por plano.
- Planejamento aprovado da Fase C (dividida em C1 e C2) — `docs/planos/fase-c.md`.
- 2.8.0 banco (`72a4305`); alertas restritos + trava `is_seed` (`bdfdb61`); seção C8 "Vendas (plano Gold)" em
  `docs/planos/fase-c.md` (`7279fd4`).
- 2.10 Fase B aprovada no teste do dono; 4 ajustes do teste (`80b2bd7` + commit da dedupe de alertas).
- Auditoria de segurança: teste de cobertura `tests/db/security-definer-coverage.test.ts` + lista de candidatas a
  `SECURITY INVOKER` em `docs/planos/auditoria-security-definer.md` (nenhuma função alterada).

## Falta (ordem aprovada)
1. ~~2.6 Impressão~~ ✔
2. ~~2.7 Verificação final da Fase 2~~ ✔ (228 testes; todos os roteiros de navegador das Fases 1 e 2 no build de
   produção; advisors revisados; índices de FKs adicionados)
3. **2.8** Ajustes do montador — plano aprovado (`~/.claude/plans/…` e `docs/planos/etapa-2.8.md`). 2.8.0 banco ✔
   (migrations `20261004120000`–`20261005120100`, 253 testes no total). 2.8.1 plano ✔, 2.8.2 exercício no plano ✔, 2.8.3 série ✔ (colunas legadas removidas), 2.8.4 produtividade ✔
   (padrões editáveis, "+ Rápido", importar exercícios, expandir/recolher, copiar para alunos). 274 testes.
   Ajustes do 1º teste ✔ (clique/+ Rápido, editor da dica, "Mais opções") e do reteste ✔ (intensidade em texto ≤ 20
   na linha principal — migration `20261007120000`; Subida/Descida — `20261007120100`/`…120200`). 291 testes.
   **Limpeza futura:** remover `intensity_type`/`intensity_value` (sem uso) junto com as próximas colunas legadas.
   **Aguardando o seu novo teste**; ajustes que surgirem entram aqui.
4. **2.10** Base de conhecimento dor × exercício — **Fase A encerrada** (25/09/2026); **Fase B aprovada** no seu teste
   manual (30/09/2026: Guias, alertas, triagem, liberação, Guia da hérnia) — plano em `docs/planos/etapa-2.10-fase-b.md`;
   commits B1 `8051a29`, B2 `65ea750`, B3 `b9c962b`, B4. Migrations `20261008120000` (condições, 2 exercícios, 19
   regras), `…120100` (triagem), `…120200` (índice).
   **Ajustes do seu teste** (aluna Ana Duarte, commits `80b2bd7` e o da dedupe de alertas):
   - Condição própria da org sem Guia (ex.: "Estenose foraminal (exemplo)") não herda mais o Guia da região — mostra
     "Sem Guia" em vez de abrir por engano o Guia genérico.
   - Alerta duplicado (mesma condição com regra global E da equipe para o mesmo exercício, ex.: "Abdominal supra"):
     agora só o pior nível vira o alerta principal; a regra mais branda fica como detalhe recolhido.
   - Nota do alerta com o rótulo "Como adaptar:" antes do texto.
   - Menu "⋯" da lista de alunos ganhou "Editar cadastro", "Treinos" e "Triagem de saúde" (itens distintos — antes só
     havia o lápis sem rótulo e "Treinos" no topo do menu, fácil de confundir); atalho "Registrar triagem" direto no
     painel "Condições do aluno" do montador, sem sair da tela.
   Roteiros e2e cobrindo os 4 ajustes: `m210-bugs-fase-b`, `m210-navegacao-triagem` (+ `k210-triagem`,
   `k210-triagem-restrita`, `k210-guias` de regressão).
   Documentos revisados em `docs/conhecimento/`: lombalgia inespecífica, hérnia (flexão), estenose e espondilolistese
   (extensão), cervicalgia, ombro (manguito), joelho patelofemoral e artrose. Sem alerta automático: lombalgia
   inespecífica, cervicalgia, dor patelofemoral e artrose de joelho (só Guia). `docs/revisao/contraindicacoes-v2.csv`:
   19 linhas "S" (flexão, extensão, tríceps no banco) e 2 "N" (patelofemoral); o CSV antigo ficou marcado como
   substituído. Condições por **diagnóstico com padrão direcional no nome**, ligadas à região, + condições só de padrão
   ("Dor lombar — intolerância à flexão/extensão"). "Condromalácia" só como sinônimo de busca.
   **Pendências registradas:** espondilólise/espondilolistese ístmica em jovens atletas; depois, se aprovado: quadril,
   hipertensão, osteoporose, gestação.
5. **App do aluno — decisão de 30/09/2026: prioridade muda.** 2.11 (biblioteca) e 2.9 (página do aluno para o
   professor) **ficam para depois**. Ordem agora:
   1. **C1 enxuta** (só o necessário para o login do aluno não precisar de retrabalho — ex.: `memberships` básico e
      vínculo ativo por sessão — **ou** justificar adiar C1 inteira para depois da Fase 3, se o login puder ser feito
      sem ela sem gerar retrabalho) — **planejar antes, mostrar o plano**.
   2. **Fase 3 mínima** (PWA do aluno): login por link/senha, treino do dia e plano atual, execução série a série
      (carga/reps feitas), timer de descanso, substitutos, vídeo do exercício, orientação de cuidado (sem alertas de
      contraindicação), pergunta de dor no início do próximo treino, escala de dor 0–10 por exercício com orientação,
      feedback/RPE ao final, histórico simples — regras já registradas na seção "Requisitos para a Fase 3" abaixo.
   3. **Lado do professor** na Fase 3: ver sessões registradas, feedbacks e avisos de dor, com as mesmas regras de
      visibilidade restrita já usadas em 2.8/2.10 (professor do plano sem acesso à saúde recebe a versão restrita).
   4. **Checklist de pré-requisitos** para uso com alunos reais (o que depende do dono): SMTP (Resend) + templates,
      `lfit-prod` (plano pago do Supabase), deploy Vercel com domínio, chaves do Turnstile de produção, revisão
      jurídica dos Termos/Política.
   **Checkpoint pedido: parar depois do desenho do banco** (antes de implementar) para revisão.
   Depois da Fase 3: **2.11** biblioteca → **2.9** página do aluno (professor) → **Importação do MFIT** → **C2**
   comercialização → **1.6** → **1.7**.

## Requisitos registrados para a Fase 3 (agora em planejamento — ver item 5 de "Falta")
- **Anamnese → triagem:** as respostas do aluno sobre sinais de alerta alimentam a mesma lista da triagem
  (`student_red_flag_checks`, `source = 'anamnesis'`, chaves de `features/knowledge/red-flags.ts`), com a mesma regra:
  sinais relatados (nunca diagnóstico) e aviso até a liberação registrada.
- **Alertas de contraindicação NUNCA aparecem ao aluno**: nem o nível ("Evitar"/"Cautela"), nem a condição, nem a
  nota. Vale para o app do aluno, a execução do treino e qualquer resposta de API acessível ao papel `student`.
- **Novo campo por item: "Orientação de cuidado ao aluno"** (texto curto, opcional). Quando o item tiver alerta,
  o montador **sugere** um texto a partir da nota, em linguagem positiva (ex.: "coluna neutra, amplitude
  confortável; se dor > 3/10, pare e avise"). O professor edita e aprova. **Só o texto aprovado** aparece no app do
  aluno, com um ícone neutro de "cuidado" (sem cor ou rótulo de alerta).
- **Escala de dor 0–10 por exercício na execução**, com orientação. **Aviso ao professor responsável quando a dor
  for > 5 OU quando a dor não voltar ao habitual no dia seguinte** (coerente com a regra de monitoramento de
  `docs/conhecimento/lombalgia-inespecifica.md`, seção 2.4 — modelo de Silbernagel 2007, extrapolado; limite
  "até 5/10" mantido). **Sem check-in no dia seguinte:** no início do próximo treino o app pergunta "Como ficou a dor
  desde o último treino?" — "Voltou ao normal" / "Ainda incomoda"; **"Ainda incomoda" gera o aviso ao professor**
  (mesmas regras de visibilidade dos avisos de dor). A dor é dado de saúde: nunca em URLs, logs ou e-mails, e o aviso não
  mostra o valor fora do app.
- **Avisos fora do app (e-mail, push) nunca citam dor nem saúde**: texto genérico (ex.: "Você tem um feedback que
  precisa da sua atenção") com link para o app; o detalhe só aparece dentro do app, para quem pode ver a saúde do aluno.
- **Professor do plano sem acesso à saúde recebe a versão restrita do aviso** (mesmo padrão dos alertas restritos da
  2.8): só qual exercício + "Feedback de atenção neste exercício — alinhe com o professor responsável", **sem** valor
  de dor nem comentário do aluno.

## Arquivos em andamento
Nenhum. Últimos arquivos mexidos: `features/plans/*`, `features/exercises/*`, `app/(app)/treinos/**`,
`app/(app)/alunos/[id]/treinos`, migrations `20260929*` a `20261002*`.

## Decisões pendentes com você
- **Revisão do ajuste de cores** (marca × semântica, laranja reduzido, contraste AA) — screenshots antes/depois
  no scratchpad da sessão; commit `6ab389e`.
- **Revisão da auditoria de segurança** (`docs/planos/auditoria-security-definer.md`): aprovar (ou não) a única
  mudança proposta — `public.can_view_student_health` → `SECURITY INVOKER`.
- **Plano do app do aluno** (C1 enxuta + Fase 3 + lado do professor + checklist de pré-requisitos) — em
  planejamento; checkpoint depois do desenho do banco.
- **Gateway** da C2: Asaas (decidido); confirmar no contrato: subconta aceita CPF? tarifa de subconta é por conta
  ativa ou criada? (ver seções C2 e C8 de `docs/planos/fase-c.md`).
- **Resultado do seu teste do montador (2.8)** — ajustes que surgirem entram na 2.8.
- Pré-requisitos seus (checklist do plano da Fase 3): SMTP (Resend) + templates, chaves do Turnstile de produção,
  conta no gateway, projeto `lfit-prod`, revisão jurídica dos Termos/Política.

## Avisos úteis
- Seed/testes só no lfit-dev. Se o login travar nos roteiros de navegador, limpar `public.rate_limits` no lfit-dev.
- Security Advisor: 35 avisos "authenticated can execute SECURITY DEFINER" (as 40 do schema `public` menos as 5 só
  de `service_role`; todas as 35 documentadas no CLAUDE.md, conferido por `tests/db/security-definer-coverage.test.ts`)
  + senha vazada (plano pago).

## O que testar na 2.8
- Plano: "Sem data de expiração", sessões previstas, professor do plano, "Agendar" com início futuro; abas Atuais/
  Futuros/Anteriores/Todos em `/alunos/[id]/treinos`.
- Exercício no plano: substitutos (até 3), método/objetivo (listas em Treinos → Métodos e objetivos), dica com
  **negrito** e listas.
- Prescrição: unidade, intensidade, velocidade ou cadência, pausa mín–máx (no resumo e em cada série).
- Produtividade: "Valores padrão" no formulário do exercício; "+ Rápido"; "Importar exercícios"; "Recolher todos";
  menu do plano → "Copiar para alunos".

## Próximo comando
Plano do app do aluno em andamento (C1 enxuta + Fase 3 + lado do professor + checklist), checkpoint depois do
desenho do banco. Depois: ajustes da 2.8 (se houver, do seu novo teste do montador). Antes de continuar, confira o
estado com:
```bash
git status && npx tsc --noEmit && npm test
```
