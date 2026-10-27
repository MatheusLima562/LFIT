# App do aluno mais humanizado: chat (com caixa de conversas do professor), Hoje humanizada, comemoração, resposta ao feedback, Perfil

_Revisão 2 — incorpora os 8 ajustes do dono (caixa de conversas do professor nesta etapa, leitura por pessoa do lado
do staff, aviso fixo no chat, PR exige histórico anterior, nada de dado sensível em log/notificação, recado expira,
limite de envio, destaque na constância)._

## Contexto

A Fase 3 mínima está no ar (login, Hoje, execução em modo foco, Histórico — commits `da2a58a`, `d29940c`). Esta etapa
torna o app menos transacional: chat com o professor (**dos dois lados — o aluno não ganha chat sem o professor
ter como responder**), uma Hoje que cumprimenta e dá contexto, comemoração ao fim do treino com recorde pessoal,
resposta do professor ao feedback, e a barra inferior completa. Checkpoint depois da migration, antes de qualquer
página — como da vez passada.

## 1. Chat aluno ↔ professor responsável/owner (com a caixa de conversas do professor)

### Tabela `chat_messages`
```
id, organization_id, student_id (fk students, on delete cascade),
sender_role text check in ('student','staff'), sender_id uuid references profiles (nulo se sender_role='student'),
body text check (char_length between 1 and 2000),
attached_item_id uuid references plan_workout_items on delete set null,   -- anexo: 1 exercício do treino ativo
attached_exercise_name text,                                               -- cópia (sobrevive ao item sumir)
created_at timestamptz default now()
```
Índice `(student_id, created_at desc)`. Sem áudio/imagem nesta etapa — só texto + o anexo de exercício (padrão já
usado em `session_item_logs`: FK anulável + nome copiado).

### Leitura: cursor por pessoa (não por mensagem)
Tabela `chat_reads(student_id, reader_role text check in ('student','staff'), reader_id uuid, last_read_at timestamptz,
primary key (student_id, reader_role, reader_id))`. Para o aluno, `reader_id` = o próprio `students.id` (um só leitor,
na prática um cursor único). Para o staff, `reader_id` = `profiles.id` — **o owner ler não mexe no cursor do
professor responsável, e vice-versa** (ajuste do dono). Não lidas = mensagens do outro lado com
`created_at > coalesce(last_read_at do meu cursor, '-infinity')`.

### RLS e visibilidade
Chat sempre visível a `private.can_access_student()` (owner + professor responsável), **independente do
consentimento de saúde** — mesma base legal da triagem (LGPD art. 11, II, "e"/"d", a validar). Professor do plano
sem acesso ao aluno não vê nada — tudo-ou-nada (sem escada restrita/oculta aqui).
- `chat_messages`/`chat_reads` select: `is_own_student(student_id)` ou `can_access_student(student_id)`.
- Escrita só por RPC.
- `alter publication supabase_realtime add table public.chat_messages;` — Realtime respeita RLS (primeiro uso de
  Realtime no projeto; nenhuma tabela está na publication hoje). Cliente: `createClient()` de `lib/db/client.ts`
  (browser), `.channel(...).on('postgres_changes', ...)`.

### RPCs
| RPC | Faz |
|---|---|
| `send_chat_message(p_student_id, p_body, p_attached_item_id?)` | Grava (aluno: `p_student_id` nulo = self; staff: exige `can_access_student`); confirma que o item anexado é do **plano ativo** do aluno. **Limite: 30 mensagens/minuto por remetente**, nos últimos 60 s — contado de dois jeitos, porque `sender_id` é nulo para o aluno: remetente **aluno** → `student_id = (meu id) and sender_role = 'student'` (um aluno só manda para a própria conversa, então `student_id` já identifica o remetente); remetente **staff** → `sender_id = auth.uid() and sender_role = 'staff'` (conta em **todas** as conversas desse professor/owner, não só numa). Acima do limite: `RATE_LIMITED` |
| `get_chat_messages(p_student_id, p_before?)` | Página de mensagens (mais recentes primeiro; `p_before` rola para trás) |
| `mark_chat_read(p_student_id)` | Upsert do meu cursor (`reader_role`/`reader_id` resolvidos de `auth.uid()`) |
| `chat_unread_count(p_student_id)` | Badge de uma conversa (aluno: self; staff: por aluno) |
| `list_chat_inbox()` | **Caixa de conversas do professor** (staff): um registro por aluno que o chamador acessa — nome, foto, prévia e hora da última mensagem (nulo se nunca houve), `unread_count` (cursor do próprio chamador). Ordenado: não lidas primeiro, depois a mensagem mais recente, depois nome — inclui alunos sem mensagem nenhuma (serve de "iniciar conversa") |
| `staff_total_unread_count()` | Soma de não lidas do chamador em todos os alunos que acessa — alimenta o selo no menu "Chat" do painel (hoje é o mock `badge: 3` em `data/navigation.ts:87`) |

### Fora do escopo desta etapa
Notificação push de mensagem nova — depende da etapa de notificações; **registrar como dependência explícita**: sem
push, cada lado só vê mensagem nova ao abrir o app/painel. Exportação a pedido do titular: incluir em
`/alunos/exportar` quando essa tela crescer (a exclusão definitiva já funciona via `on delete cascade`, mesmo padrão
de toda a Fase 3).

### Segurança: nada de conteúdo sensível fora do banco
`body` do chat e `coach_reply`/`feedback_note` da sessão **nunca** entram em `audit_logs`, log, e-mail, URL ou (no
futuro) conteúdo de notificação push — mesma regra da dor e dos grupos especiais. Nenhuma das RPCs novas chama
`private.audit()` com o texto; se precisar auditar o envio em si, só o id/contagem, nunca o corpo. **Registrar
explicitamente no CLAUDE.md** (seção "Segurança e LGPD") junto com as demais regras de dado sensível.

## 2. Hoje humanizada

`get_my_student_profile()` passa a devolver também: `trainer_avatar_url`, `trainer_office_hours` (de
`profiles.preferences->>'office_hours'` do professor responsável — sem migration, o grant de update já existe),
`sessions_this_month` (sessões concluídas no mês civil em SP) e `week_streak` (semanas consecutivas, segunda a
domingo em SP, com ≥ 1 sessão concluída — "ilhas" de semanas consecutivas, mesmo princípio de `private.today_br()`).

### "Recado do professor" — tabela própria, não é chat
```
trainer_announcements: id, organization_id, trainer_id (autor), student_id (nulo = todos os alunos dele),
body text (≤ 300), active boolean default true,
expires_at timestamptz not null default (now() + interval '7 days'),
created_at timestamptz default now()
```
`get_my_announcement()`: o recado ativo, **não expirado** (`expires_at > now()`), mais recente, visível ao aluno —
`student_id = eu` ou (`student_id is null` e `trainer_id` = meu responsável, ou meu responsável é nulo e `trainer_id`
é o owner). Um só por vez. RPC `set_trainer_announcement(p_student_id?, p_body)` (staff; `student_id` nulo = todos os
alunos do próprio chamador) fica só no banco nesta etapa — a tela de criar recado entra depois, junto da caixa de
conversas do professor completa.

## 3. Fim do treino: comemoração com destaque na constância (não na carga)

RPC `get_session_summary(p_session_id)`: resumo da sessão (exercícios, séries) + por exercício com carga numérica,
`{ exercise_name, best_load_now, prior_best, is_pr }`. **`is_pr` só é `true` quando existe carga anterior registrada
em sessão concluída anterior** (`prior_best is not null and best_load_now > prior_best`) — a primeira vez que o
aluno faz um exercício não conta como recorde (nada para bater). Escopo: `is_own_student` ou `can_access_student`
(carga não é dado de saúde). **Na tela** (próxima etapa): o número de destaque é `sessions_this_month`/constância;
o recorde pessoal aparece como um selo discreto, não o título da tela.

## 4. Professor responde ao feedback

`workout_sessions` ganha `coach_reply text` (≤ 300), `coach_reply_at`, `coach_reply_by`. RPC
`reply_to_session(p_session_id, p_reply)`: staff com `can_access_student` (RPE/comentário não é dado de saúde —
diferente da dor, que já tem a própria escada em `student_session_alerts`). `get_my_workout_history` passa a
devolver `coach_reply`.

## 5. Barra inferior: Hoje · Histórico · Chat · Perfil (+ caixa de conversas no painel)

**Entram nesta etapa de páginas (depois do checkpoint do banco), junto — o chat do aluno não vai ao ar sozinho:**
- **`/aluno/chat`**: aviso fixo no topo — "Não é canal de emergência. Dor forte, falta de ar ou dor no peito: ligue
  192." + horário de atendimento do professor + "Sua conversa é vista pelo seu professor e pela coordenação do
  estúdio."; lista de mensagens + envio + anexar exercício do treino ativo.
- **`/aluno/perfil`**: nome, foto, organização, professor (nome + horário), status efetivo, sair.
- **`/chat`** (painel do professor — já citado em `data/navigation.ts:87`, hoje sem rota real): caixa de conversas
  (`list_chat_inbox`, não lidas primeiro), abre a conversa (mesmas `get_chat_messages`/`send_chat_message` em modo
  staff), selo de não lidas no menu lateral (`staff_total_unread_count`, substitui o `badge: 3` fixo).
- `StudentNav.tsx` vira `grid-cols-4`; novas chaves em `messages.aluno.nav`.

## Verificação (etapa do banco → checkpoint)

1. Migration (`chat_messages`, `chat_reads`, publication Realtime, RLS, `trainer_announcements`,
   `workout_sessions.coach_reply*`, as 8 RPCs novas) → `npm run db:push` (confirmar antes) → `npm run db:types`.
   CLAUDE.md: tabela SECURITY DEFINER (o teste de cobertura cobra), seção da Fase 3 atualizada, e a regra de "nada de
   chat/feedback em log, e-mail, URL ou notificação" na seção de Segurança e LGPD.
2. `tests/db/`: aluno só lê/escreve o próprio chat; staff só com `can_access_student`; professor do plano sem acesso
   não vê nada (nem `chat_unread_count`); **cursores de leitura independentes** — owner marcar como lida não muda o
   não lido do professor responsável, e vice-versa; anexo recusa item fora do plano ativo; `send_chat_message` recusa
   a 31ª mensagem no mesmo minuto tanto do lado do aluno (contado por `student_id`, já que `sender_id` é nulo) quanto
   do lado do staff (contado por `sender_id`, somando as conversas de alunos diferentes) — `RATE_LIMITED`; `list_chat_inbox` ordena não lidas primeiro e inclui aluno sem
   mensagem; recado por aluno específico não vaza para outros, e recado expirado (`expires_at` no passado) não
   aparece; `coach_reply` recusado sem `can_access_student`; `get_session_summary` marca PR só quando há carga
   anterior (sessão nova de um exercício nunca feito → `is_pr = false`) e marca corretamente quando supera o
   histórico.
3. `tests/db/security-definer.test.ts` / `security-definer-coverage.test.ts`: RPCs novas recusam anônimo; as de
   staff recusam aluno; todas documentadas no CLAUDE.md.
4. `npx tsc --noEmit && npm run lint && npm test` → **checkpoint: parar antes de qualquer página.**
