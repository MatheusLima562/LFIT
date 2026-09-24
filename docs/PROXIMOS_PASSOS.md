# Próximos passos (retomada)

_Atualizado em 24/09/2026 (fim da 2.8 — aguardando seu teste)._

## Etapa atual
**Fase 2 — Treinos e exercícios.** 2.1 a 2.7 concluídas. **2.8.0 (banco) aprovada** + ajustes pedidos:
alerta **restrito** (nível + texto genérico, sem condição/grupo/nota) para o professor do plano sem acesso ao aluno e
para o owner com consentimento só declarado; trava `organizations.is_seed` no `seed --reset`. 2.8.1 (plano), 2.8.2 (exercício no plano), 2.8.3 (prescrição da série) e **2.8.4 (produtividade) ✔**. Colunas legadas removidas.
**Parado para o seu teste da 2.8.** Nada em andamento no código.

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

## Falta (ordem aprovada)
1. ~~2.6 Impressão~~ ✔
2. ~~2.7 Verificação final da Fase 2~~ ✔ (228 testes; todos os roteiros de navegador das Fases 1 e 2 no build de
   produção; advisors revisados; índices de FKs adicionados)
3. **2.8** Ajustes do montador — plano aprovado (`~/.claude/plans/…` e `docs/planos/etapa-2.8.md`). 2.8.0 banco ✔
   (migrations `20261004120000`–`20261005120100`, 253 testes no total). 2.8.1 plano ✔, 2.8.2 exercício no plano ✔, 2.8.3 série ✔ (colunas legadas removidas), 2.8.4 produtividade ✔
   (padrões editáveis, "+ Rápido", importar exercícios, expandir/recolher, copiar para alunos). 274 testes.
   **Aguardando o seu teste**; ajustes que surgirem entram aqui.
4. **2.9** Página do aluno `/alunos/[id]` (cabeçalho com ações, abas Treinos/Informações/Turmas, sub-abas Atuais/
   Futuros/Anteriores/Todos, entradas pela lista) — **mostrar o plano antes de implementar**; sem migration salvo necessidade.
5. **C1** Contas com múltiplos vínculos (sem cobrança).
6. **Fase 3 mínima** → **Importação do MFIT** → **C2** comercialização → **1.6** → **1.7**.

## Requisitos registrados para a Fase 3 (não implementar antes)
- **Alertas de contraindicação NUNCA aparecem ao aluno**: nem o nível ("Evitar"/"Cautela"), nem a condição, nem a
  nota. Vale para o app do aluno, a execução do treino e qualquer resposta de API acessível ao papel `student`.
- **Novo campo por item: "Orientação de cuidado ao aluno"** (texto curto, opcional). Quando o item tiver alerta,
  o montador **sugere** um texto a partir da nota, em linguagem positiva (ex.: "coluna neutra, amplitude
  confortável; se dor > 3/10, pare e avise"). O professor edita e aprova. **Só o texto aprovado** aparece no app do
  aluno, com um ícone neutro de "cuidado" (sem cor ou rótulo de alerta).
- **Escala de dor 0–10 por exercício na execução**, com orientação. **Dor ≥ 5 gera aviso ao professor
  responsável.** A dor é dado de saúde: nunca em URLs, logs ou e-mails, e o aviso não mostra o valor fora do app.
- **Avisos fora do app (e-mail, push) nunca citam dor nem saúde**: texto genérico (ex.: "Você tem um feedback que
  precisa da sua atenção") com link para o app; o detalhe só aparece dentro do app, para quem pode ver a saúde do aluno.
- **Professor do plano sem acesso à saúde recebe a versão restrita do aviso** (mesmo padrão dos alertas restritos da
  2.8): só qual exercício + "Feedback de atenção neste exercício — alinhe com o professor responsável", **sem** valor
  de dor nem comentário do aluno.

## Arquivos em andamento
Nenhum. Últimos arquivos mexidos: `features/plans/*`, `features/exercises/*`, `app/(app)/treinos/**`,
`app/(app)/alunos/[id]/treinos`, migrations `20260929*` a `20261002*`.

## Decisões pendentes com você
- **CSV de contraindicações** (`docs/revisao/contraindicacoes-sugeridas.csv`): devolver com a coluna "aprovar (S/N)";
  só as linhas aprovadas viram regras globais, numa migration própria.
- **Gateway** da C2: Asaas (decidido); confirmar no contrato: subconta aceita CPF? tarifa de subconta é por conta
  ativa ou criada? (ver seções C2 e C8 de `docs/planos/fase-c.md`).
- **Resultado do seu teste do montador** — ajustes que surgirem entram na 2.8.
- Pré-requisitos seus: SMTP (Resend) + templates, chaves do Turnstile de produção, conta no gateway, projeto `lfit-prod`,
  revisão jurídica dos Termos/Política.

## Avisos úteis
- Seed/testes só no lfit-dev. Se o login travar nos roteiros de navegador, limpar `public.rate_limits` no lfit-dev.
- Security Advisor: 32 avisos "authenticated can execute SECURITY DEFINER" (todos documentados no CLAUDE.md) + senha vazada (plano pago).

## O que testar na 2.8
- Plano: "Sem data de expiração", sessões previstas, professor do plano, "Agendar" com início futuro; abas Atuais/
  Futuros/Anteriores/Todos em `/alunos/[id]/treinos`.
- Exercício no plano: substitutos (até 3), método/objetivo (listas em Treinos → Métodos e objetivos), dica com
  **negrito** e listas.
- Prescrição: unidade, intensidade, velocidade ou cadência, pausa mín–máx (no resumo e em cada série).
- Produtividade: "Valores padrão" no formulário do exercício; "+ Rápido"; "Importar exercícios"; "Recolher todos";
  menu do plano → "Copiar para alunos".

## Próximo comando
Depois do teste: **ajustes da 2.8** (se houver) ou **"Planeje a 2.9"** (mostrar o plano antes). Antes, confira o estado com:
```bash
git status && npx tsc --noEmit && npm test
```
