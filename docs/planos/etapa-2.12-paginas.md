# Etapa 2.12 — páginas (chat, aluno, professor)

_Aprovado pelo dono com ajustes (08/10/2026). Banco da 2.12 em `docs/planos/etapa-2.12.md`._

Três entregas, cada uma com checkpoint, teste do dono e commit próprios. Cada uma fecha com
`npx tsc --noEmit && npm run lint && npm test` + o roteiro e2e dela no build de produção (`next start`).

## Decisões do dono

1. **Foto do professor:** bucket próprio, **só na 3.3**, em migration própria (aprovada antes do push).
2. **Feedback:** o owner sem acesso à saúde **não** vê nem responde ao feedback. Na migration da 3.3:
   `reply_to_session` passa a exigir `can_view_student_health` (coerente com o RLS de leitura de `workout_sessions`), e
   o professor pode **encerrar o recado atual**. A tela esconde o campo de resposta para quem não lê o comentário.
3. **Idempotência do chat:** feita antes da 3.1 — `20261014120000_chat_client_msg_id.sql` (`client_msg_id` único por
   remetente; reenvio devolve a linha já gravada sem contar de novo no limite).

## Constatações do código que moldam o plano

- Nenhuma tela do staff lista sessões (`feedback_note`, `student_session_alerts` sem UI): a resposta ao feedback (3.3)
  precisa de uma lista nova.
- Leitura de `workout_sessions` exige `can_view_student_health`; `get_my_workout_history` não devolve `feedback_note`.
- `profiles.avatar_url` existe (grant de update já dado), mas não há bucket de foto do professor.
- O menu lateral lê `navigation` estático no cliente e o layout do staff não re-renderiza na navegação: o selo precisa
  de atualização no cliente.
- O fim de treino passa pela fila local: o resumo só pode ser lido depois que a fila esvazia.

## 3.1 Chat (aluno + caixa de conversas do professor)

**Telas**
- `/aluno/chat`: aviso fixo no topo — "Não é canal de emergência. Dor forte, falta de ar ou dor no peito: ligue 192." e
  "Sua conversa é vista pelo seu professor e pela coordenação do estúdio" + horário de atendimento do professor
  (`trainer_office_hours`; a linha some se vazio). Lista com rolagem para trás (`p_before`), campo de envio com contador de
  2000 caracteres, "Anexar exercício" (itens do plano ativo, via `get_my_active_plan`).
- `/chat` (painel): duas colunas no desktop (caixa `list_chat_inbox` + conversa), uma no celular; aluno escolhido por
  `?aluno=<id>` (só o id). Item "Chat" de `data/navigation.ts` vira `available` e perde o `badge: 3`; o `(app)/layout`
  busca `staff_total_unread_count` e passa para `AppShell` → `Sidebar`.
- Anexo: só o aluno anexa; o staff vê o chip com o nome do exercício.
- **Barra inferior com 3 abas** nesta entrega (Hoje · Histórico · Chat); a 3.2 passa para 4.
- **Layout do chat:** altura `100dvh` (teclado do celular não esconde o campo), **fonte de 16 px** no campo (evita o
  zoom automático do iOS), lista de mensagens com **`aria-live="polite"`** para leitores de tela anunciarem as novas.

**Código** — `features/chat/`: `thread.ts` (lógica pura: juntar, deduplicar, ordenar, reconciliar), `useChatThread`
(Realtime, recarga, cursor), componentes de lista e campo de envio compartilhados. Envio **do navegador direto para o
RPC** (sem server action): o corpo nunca passa pelo nosso servidor nem pelos logs da Vercel.

**Realtime**
- **Isolamento:** a garantia é o RLS de `chat_messages` (`is_own_student` ou `can_access_student`), avaliado por
  assinante em cada evento `postgres_changes`. O filtro `student_id=eq.<id>` só economiza tráfego. O aluno assina a
  própria conversa; a caixa do staff assina a tabela e o RLS entrega só os alunos que ele acessa.
- DELETE não passa pelo RLS: não há exclusão de mensagem (só a cascata do aluno) e o cliente ignora DELETE.
- Token: `createBrowserClient` repassa o token ao Realtime; teste manual de uma aba aberta por mais de 1 h.
- **Queda de conexão:** status do canal (`SUBSCRIBED` / `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`); fora de `SUBSCRIBED`
  → aviso discreto "Reconectando…" e busca a cada 20 s com a aba visível. Em `online`, `visibilitychange` (visível) e a
  cada reconexão, busca de novo a página mais recente e junta com o que está na tela (o Realtime não reenvia o perdido).
- Cursor: `mark_chat_read` ao abrir e quando chega mensagem com a aba visível (com espera curta). Sem "visto" para o
  outro lado.

**Duplicadas, ordem e erros**
- Ordenação sempre por `(created_at, id)`; mensagens num mapa por `id`.
- **A mensagem local usa o `client_msg_id`** (UUID gerado no cliente) como chave até o retorno do RPC; o evento do
  Realtime traz o mesmo `client_msg_id` e é casado com ela — a mensagem aparece uma vez só, chegue primeiro o retorno ou
  o evento.
- Erro de rede: a mensagem fica "Não enviada · Tentar de novo", **reenviada com o mesmo `client_msg_id`** (o banco
  devolve a linha se a primeira tinha gravado). Sem reenvio automático; botão desabilitado enquanto envia.
- `RATE_LIMITED` → "Você enviou muitas mensagens seguidas. Aguarde um minuto." (texto continua no campo).
- Estados vazios: aluno sem mensagens ("Mande uma mensagem para o seu professor"); professor sem conversas.

**Selos de não lidas:** aluno — aba Chat com `chat_unread_count` + hook escutando a própria conversa; professor — selo do
layout + o mesmo hook escutando a tabela (pelo RLS).

**Testes**
- Unitários `tests/unit/chat-thread.test.ts`: juntar, deduplicar por `client_msg_id`, fora de ordem, reconciliação,
  mapeamento de erros.
- Banco `tests/db/chat-realtime.test.ts`: a mensagem do aluno A chega a A, ao responsável e ao owner; não chega ao
  professor só do plano, ao aluno B nem ao owner de outra organização.
- e2e `e2e/k212-chat.e2e.mjs` (375 px): aluno envia → professor vê selo e mensagem sem recarregar; professor responde →
  aluno recebe sem recarregar; anexo; sem internet → aviso + "Não enviada" → ao voltar, reenvio sem duplicar e busca de
  recuperação; 31 mensagens → mensagem amigável; textos fixos; corpo nunca na URL nem no `document.title`.
  **Frase-canário** única por execução (ex.: `canario-k212-<timestamp>`) enviada no chat e impressa pelo roteiro, para o
  dono buscar nos logs do Supabase e confirmar que o corpo não aparece lá.
- Seed: algumas mensagens fictícias para a Camila.

## 3.2 Aluno: Hoje, fim de treino, Perfil e barra de 4 abas

- **Hoje:** saudação pela hora em SP; card do professor (foto ou iniciais, nome, horário, atalho "Mandar mensagem");
  recado (`get_my_announcement`, some se não houver); constância em destaque ("3 treinos este mês", "2 semanas
  seguidas"; com 0, texto neutro, sem cobrança).
- **Fim de treino:** rota `/aluno/treino/[sessionId]/concluido`; o `SessionRunner` vai para ela quando a fila esvazia.
  Lê `get_session_summary` no servidor: constância em destaque, exercícios e séries, recordes como selo discreto (só
  `is_pr = true`), "Seu professor vai ver seu comentário" se houve comentário. A **resposta do professor** chega depois:
  aparece no Histórico (`coach_reply`) e num aviso na Hoje ("Seu professor respondeu sobre o treino de terça").
- **`/aluno/perfil`:** nome, foto, organização, professor (nome e horário), status, "Sair" (sai do cabeçalho).
- **`StudentNav`:** `grid-cols-4` (Hoje · Histórico · Chat · Perfil), `aria-current`, área de toque ≥ 44 px.

**Testes:** unitários (saudação por hora em SP com a virada perto da meia-noite; textos de constância 0/1/N; seleção
de recordes); e2e `e2e/k212-aluno.e2e.mjs` (375 px): Hoje com recado e horário, treino até a conclusão (recorde numa
segunda sessão com carga maior), Perfil, 4 abas por teclado, resposta do professor no Histórico.

## 3.3 Professor: recado, resposta ao feedback, horário e foto

- **Migration própria** (mostrada antes do push): bucket privado de foto do professor (`<org>/<profile>/<uuid>.jpg`,
  até 1 MB; o aluno recebe URL assinada do servidor depois que `get_my_student_profile` autoriza, como os vídeos);
  `reply_to_session` passa a exigir `can_view_student_health`; RPC para o professor **encerrar o recado atual**.
- **Recado:** "Recado para este aluno" em `/alunos/[id]/treinos` e "Recado para todos os meus alunos" no `/chat`
  (até 300, "expira em 7 dias"), com "Encerrar recado".
- **Resposta ao feedback:** seção "Sessões recentes" em `/alunos/[id]/treinos` (data, divisão, RPE, comentário, campo de
  resposta até 300). **O campo de resposta só aparece para quem lê o comentário** (`can_view_student_health`).
- **Horário e foto:** página "Meu perfil" no menu do usuário. Horário em `preferences.office_hours` (texto até 80,
  Zod, junta com as preferências existentes sem apagar `studentsView`).

**Testes:** unitários (Zod do horário, junção de `preferences`); banco (políticas do bucket; `reply_to_session` recusado
sem `can_view_student_health`; encerrar recado só o autor); e2e `e2e/k212-professor.e2e.mjs` (recado → aluno vê a
375 px; encerrar → some; resposta → aluno vê no Histórico; horário → aparece na Hoje e no chat).

## Conteúdo sensível (todas as entregas)

Corpo da mensagem, recado e `coach_reply`: nunca na URL (só `?aluno=<id>`), em `console.*`, título de página, toast de
erro, `audit_logs`, e-mail ou notificação; nunca passam por server action (navegador → RPC). Sem push, e-mail nem service
worker nesta etapa. O e2e confere URL e `document.title` e usa a frase-canário para a busca nos logs do Supabase.

## Riscos

- Desempenho do Realtime com RLS (checagem por assinante; a caixa do staff assina a tabela): ok na escala atual, rever na C2.
- Token expirado num canal aberto: teste manual de 1 h; a busca de recuperação cobre.
- Aluno suspenso fica sem chat (portão do layout) — mantido por coerência; mudar é decisão do dono.
- Roteiros com dois navegadores: mais tempo e logins (o executor já limpa `rate_limits`).

## Fora desta etapa

Notificação push, e-mail de mensagem nova, service worker; áudio/imagem; editar/apagar mensagem; "digitando…"; "visto"
para o outro lado; fila offline de envio no chat; anexo enviado pelo professor; exportar a conversa para o titular;
lista/edição de recados (além de encerrar o atual); página do aluno `/alunos/[id]` (2.9); leitura do feedback pelo owner
sem acesso à saúde.
