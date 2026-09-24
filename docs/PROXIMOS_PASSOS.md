# Próximos passos (retomada)

_Atualizado em 24/09/2026._

## Etapa atual
**Fase 2 — Treinos e exercícios.** 2.1 a 2.7 concluídas e commitadas; próxima: planejar a 2.8. Você está testando o montador (2.5) com um
treino real. **Nada em andamento no código** (working tree limpo, `tsc` sem erros).

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

## Falta (ordem aprovada)
1. ~~2.6 Impressão~~ ✔
2. ~~2.7 Verificação final da Fase 2~~ ✔ (228 testes; todos os roteiros de navegador das Fases 1 e 2 no build de
   produção; advisors revisados; índices de FKs adicionados)
3. **2.8** Ajustes do montador — **pendente**, plano em `docs/planos/etapa-2.8.md` (planejar e mostrar antes de implementar).
4. **C1** Contas com múltiplos vínculos (sem cobrança).
5. **Fase 3 mínima** → **Importação do MFIT** → **C2** comercialização → **1.6** → **1.7**.

## Arquivos em andamento
Nenhum. Últimos arquivos mexidos: `features/plans/*`, `features/exercises/*`, `app/(app)/treinos/**`,
`app/(app)/alunos/[id]/treinos`, migrations `20260929*` a `20261002*`.

## Decisões pendentes com você
- **CSV de contraindicações** (`docs/revisao/contraindicacoes-sugeridas.csv`): devolver com a coluna "aprovar (S/N)";
  só as linhas aprovadas viram regras globais, numa migration própria.
- **Gateway** da C2 (recomendação: Asaas; confirmar taxas) e as pendências listadas em `docs/planos/fase-c.md` (seção C2).
- **Resultado do seu teste do montador (2.5)** — ajustes que surgirem entram antes da 2.6 ou na 2.8.
- Pré-requisitos seus: SMTP (Resend) + templates, chaves do Turnstile de produção, conta no gateway, projeto `lfit-prod`,
  revisão jurídica dos Termos/Política.

## Avisos úteis
- Seed/testes só no lfit-dev. Se o login travar nos roteiros de navegador, limpar `public.rate_limits` no lfit-dev.
- Security Advisor: 29 avisos "authenticated can execute SECURITY DEFINER" (todos documentados no CLAUDE.md) + senha vazada (plano pago).

## Próximo comando
Depois do seu teste do montador, peça: **"Siga com a 2.6 (impressão)"**. Antes, confira o estado com:
```bash
git status && npx tsc --noEmit && npm test
```
