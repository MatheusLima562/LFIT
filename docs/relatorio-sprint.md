# Relatório da sprint autônoma (28/10/2026)

Plano: `docs/plano-sprint-autonoma.md`. Decisões tomadas sozinho: `docs/decisoes-autonomas.md` (entradas de 28/10/2026).
Roteiros e2e sempre no build de produção (`next start -p 3100`), no lfit-dev.

## Pacote 1 — Estabilidade ✔ (sem migration)

**(a) Primeiro login após recriar os dados de teste.**
- Causa raiz: limite do **Supabase Auth hospedado** — 30 logins (`sign_in_sign_ups`) a cada 5 min por IP. O seed faz 4
  logins a cada `--reset`; f3 + k212 + k212-chat-layout em série, com reseed antes de cada um, passaram de 30 e o primeiro
  login do roteiro seguinte voltava 429. Bug real do app: o 429 aparecia como "E-mail ou senha incorretos".
- Correções: `signInErrorMessage` (`features/auth/schemas.ts`) — 429/`over_request_rate_limit` → "Muitas tentativas…"
  no login do painel e do aluno (por IP, não revela se a conta existe), teste `tests/unit/auth-errors.test.ts`;
  `e2e/_login.mjs` imprime a mensagem da tela numa linha "✗" quando o login não termina; o executor avisa quando a falha é
  o limite do Auth; `k212-chat-layout` faz um login só e reusa os cookies (3 → 1).

**(b) "This page couldn't load" no montador.**
- Causa raiz (reproduzida): server action que rejeita (rede caiu, `next start` reiniciado, versão nova com outro id de
  action) dentro de `startTransition` sobe ao error boundary; sem `error.tsx`, o Next mostra a tela global. A busca do
  seletor chama uma action a cada digitação — o caminho mais frequente.
- Correções: `lib/action.ts` (`callAction`: aviso "Não foi possível falar com o servidor…" e a tela continua) no seletor,
  salvar/ativar, importar, copiar para alunos, aplicar modelo, ações do plano, triagem e ações do exercício;
  `app/(app)/error.tsx` e `app/aluno/(logado)/error.tsx` (`RouteError`: "Tentar de novo"/"Voltar ao início", sem a
  mensagem do erro, o menu continua). e2e novo `e2e/m28-falha-rede.e2e.mjs` (busca e salvar sem servidor → aviso, nada
  perdido; servidor de volta → busca responde). Antes da correção o mesmo cenário derrubava a página.

**(c) `chat_unread_count` repetido.**
- Medido (aluno: Hoje → Chat → Hoje): 4 contagens e 2 `mark_chat_read` → **2 contagens e 1 marcação**.
- `features/chat/unread.ts` (agendador puro: junta pedidos, intervalo mínimo de 2 s, nunca duas ao mesmo tempo, nada com a
  aba oculta; `tests/unit/chat-unread.test.ts`); `useChatUnread` com estado compartilhado por conversa (um canal e uma
  busca para todos os selos); `markRead` não repete o mesmo ponto (o cursor nunca volta).
- **Bug achado no caminho (já existia):** o canal do selo entrava no Realtime logo no carregamento, antes de o cliente ler
  a sessão — como `anon` — e o Realtime recusava ("invalid column for filter student_id"). O selo do aluno **nunca**
  recebia mensagem nova pelo Realtime; só se atualizava por buscas paralelas (que a redução acima tiraria). Correção:
  `features/chat/realtime.ts` (`joinWithAuth`: `realtime.setAuth()` antes de entrar) nos três canais do chat. Regressão
  travada no k212: falha se o Realtime recusar qualquer assinatura.

**(d) `get_chat_messages` sem acesso → vazio:** mantido (ver decisões). **(e) `sender_id`:** nenhum plano descrevia; não
mexido (o Realtime entrega a linha inteira pelo RLS — esconder na RPC não adiantaria).

**Testes:** unitários 267/267; `tsc` e lint ok; e2e no build de produção: f3-app-aluno ✓, k212-chat ✓,
k212-chat-layout ✓, m28-falha-rede ✓ (4/4).
