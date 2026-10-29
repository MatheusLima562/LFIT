# Relatório da sprint autônoma (28/10/2026)

Plano: `docs/plano-sprint-autonoma.md`. Decisões tomadas sozinho: `docs/decisoes-autonomas.md` (entradas de 28/10/2026).
Roteiros e2e sempre no build de produção (`next start -p 3100`), no lfit-dev.

## Pacote 1 — Estabilidade ✔ (sem migration)

**(a) Primeiro login após recriar os dados de teste.**
- **Correção do diagnóstico (feita no pacote 2):** a primeira hipótese — limite do Supabase Auth (30 logins/5 min por
  IP) — **não foi comprovada**: a suíte de banco faz centenas de logins por senha e passa, então o limite efetivo do
  lfit-dev é maior; nunca vi "Muitas tentativas" na tela. Causa **comprovada** das falhas intermitentes (login que não
  termina, `ERR_NETWORK_IO_SUSPENDED`, `fetch failed`, `Hook timed out`): **o Mac entra em sono por ociosidade na
  bateria** durante as execuções longas (`pmset -g log`: "Entering Sleep state due to 'Idle Sleep'" às 22:00:17 por 959 s,
  no meio da suíte e dos roteiros; "Maintenance Sleep" às 20:51). A rede fica suspensa e tudo que estava esperando estoura
  o tempo. Correção no setup: execuções longas com `caffeinate -i` (impede só o sono por ociosidade, só enquanto o comando
  roda) — depois disso, os mesmos testes passaram.
- O que continua valendo do pacote 1: o 429 do Auth aparecia como "E-mail ou senha incorretos" (bug real, corrigido) e o
  diagnóstico do login nos roteiros.
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

## Pacote 2 — Etapa 3.3 enxuta ✔ (migration `20261028120000`, aplicada no lfit-dev)

**O que entrou**
- `reply_to_session` exige `can_view_student_health` **no servidor** (antes: só `can_access_student`). Recusa =
  `SESSION_NOT_FOUND`, sem gravar nada. A tela só mostra comentário e campo de resposta para quem vê a saúde.
- `end_trainer_announcement`: só o autor, da própria organização, encerra o recado (`active = false`).
- `/alunos/[id]/treinos`: "Recado para este aluno" (publicar até 300, visível 7 dias, "Encerrar recado"; recado de outra
  pessoa da equipe aparece sem o botão) e "Sessões recentes" (últimas 10 concluídas: data, divisão, esforço, comentário,
  resposta; "Responder"/"Editar resposta"). `/chat`: botão "Recado para todos" (mesmo editor). Textos **do navegador
  direto para as RPCs** (nunca server action, toast ou URL). Código em `features/coach/`.
- Tutorial do professor: seções "Deixar um recado para o aluno" e "Responder ao comentário do treino"; vídeo 03
  regravado (a tela de treinos do aluno aparece nele).
- Achado no caminho (bug real): falha da RPC `get_my_student_profile` virava **página em branco** no app do aluno (ou
  "Acesso suspenso" no layout, mensagem falsa). Agora vira a tela "Tentar de novo" (`RouteError`).
- Adiado (como pedido): foto do professor, bucket de avatar, horário de atendimento avançado.

**Dry-run antes do push:** listou só `20261028120000_coach_reply_health_end_announcement.sql` (projeto
`fwbpazxawtxuppuczijd`, o lfit-dev).

**SQL completo**

```sql
-- Etapa 3.3 enxuta (decisões do dono em docs/planos/etapa-2.12-paginas.md):
-- 1) reply_to_session passa a exigir que o chamador veja a saúde do aluno (can_view_student_health), coerente com o
--    RLS de leitura de workout_sessions: quem não lê o comentário não responde a ele. Recusa = SESSION_NOT_FOUND (não
--    confirma que a sessão existe).
-- 2) end_trainer_announcement: o autor encerra o próprio recado (active = false). Nenhum texto em audit_logs.

create or replace function public.reply_to_session(p_session_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.workout_sessions;
  v_reply text := trim(coalesce(p_reply, ''));
begin
  perform private.require_staff();
  if v_reply = '' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'reply';
  end if;
  select * into w from public.workout_sessions where id = p_session_id;
  if not found
     or not private.can_access_student(w.student_id)
     or not private.can_view_student_health(w.student_id) then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.workout_sessions
  set coach_reply = left(v_reply, 300), coach_reply_at = now(), coach_reply_by = (select auth.uid())
  where id = w.id;
end;
$$;
revoke execute on function public.reply_to_session(uuid, text) from public, anon;
grant execute on function public.reply_to_session(uuid, text) to authenticated;

create function public.end_trainer_announcement(p_announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_staff();
begin
  update public.trainer_announcements
  set active = false
  where id = p_announcement_id
    and organization_id = v_org
    and trainer_id = (select auth.uid())
    and active;
  if not found then
    raise exception 'ANNOUNCEMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.end_trainer_announcement(uuid) from public, anon;
grant execute on function public.end_trainer_announcement(uuid) to authenticated;
```

**Testes**
- Banco, novo `tests/db/coach-3-3.test.ts` (5): owner que acessa o aluno mas não vê a saúde é recusado (nada gravado);
  professor sem acesso ao aluno, outra organização, aluno e anônimo recusados; responsável e owner-sem-professor
  respondem; encerrar recado só o autor (owner, outro professor, outra org → `ANNOUNCEMENT_NOT_FOUND`; aluno → `FORBIDDEN`;
  anônimo recusado); recado encerrado some para o aluno; nenhum texto em `audit_logs`. `security-definer.test.ts` cobre a
  função nova (aluno e anônimo); cobertura do CLAUDE.md ok.
- Suíte de banco completa: 307 ok; 2 arquivos estouraram o tempo (`chat-realtime`, cobertura) **porque o Mac dormiu às
  22:00 no meio da execução** (ver pacote 1); repetidos com `caffeinate -i`: passaram. Nenhum teste alterado.
- e2e no build de produção: novo `e2e/k212-professor.e2e.mjs` (professor publica/encerra recado, vê e responde o
  comentário; aluna a 375 px vê o recado na Hoje e a resposta no Histórico; recado para todos; owner sem acesso à saúde não
  vê comentário nem "Responder"; professor a 375 px sem rolagem horizontal; textos fora de URL) + f3-app-aluno,
  k212-chat, k212-chat-layout: **4/4**. Unitários e `tsc`/lint ok.

## Pacote 3 — Notificações N1 ✔ (sem migration)

- **Mensagem nova:** toast "Nova mensagem no chat" (com "Abrir") quando a contagem de não lidas sobe fora da conversa —
  no app do aluno e no painel. Usa o estado compartilhado do selo (pacote 1), agora com o Realtime funcionando.
- **Recado novo:** marcador na aba Hoje (`aria-label` "Hoje, novo recado") até o aluno ver o recado, e toast "Novo recado do
  seu professor" uma vez por recado. O recado é buscado ao abrir o app e ao voltar à aba (sem Realtime de recado — ficaria
  para uma migration de publicação).
- **Nada de conteúdo:** nenhum aviso traz texto da mensagem, do recado, nome do aluno ou dado de saúde; no aparelho só
  ficam ids de recado (`localStorage`, com try/catch). Regras puras em `features/notifications/n1.ts`
  (`tests/unit/notifications-n1.test.ts`).
- **Bugs achados no caminho (já existiam):** (1) os avisos neutros (`toast()`) não tinham fundo — o wrapper usava
  `var(--popover)`/`var(--border)`, que não existem (o projeto expõe `--color-*`); (2) no celular os avisos cobriam a barra
  de abas do aluno — agora ficam acima dela (`mobileOffset`).
- **Testes:** unitários 273/273; e2e novo `e2e/n1-notificacoes.e2e.mjs` (375 px: toast fora do chat e não dentro, selo,
  marcador e toast do recado, marcador some depois de ver, sem toast repetido; aviso acima da barra e com fundo; professor
  recebe o aviso sem conteúdo nem nome; nada em URL). Regressão no build de produção: f3, k212 (3), k212-professor,
  todos os m28 (11) e n1 — **16/16**.

## Pacote 4 — Chat e inadimplência ✖ (não implementado — decisão sua)

- O pedido: "professor em somente leitura após a carência; alunos **NÃO** perdem acesso".
- O registrado: CLAUDE.md ("Decisões já tomadas … o personal fica em somente leitura **e os alunos perdem o acesso**") e
  `docs/planos/fase-c.md` ("Alunos após a carência (decisão sua): perdem acesso"; item "Reavaliar" a regra).
- Além do conflito, a regra depende da C2 (tabela `subscriptions`, status `past_due`, carência configurável), que não
  existe. Não há "parte já decidida e completa" implementável sem inventar regra de cobrança.
- **Para destravar:** (1) confirmar qual regra vale para os alunos depois da carência; (2) o chat entra no "somente leitura"
  do professor (pode ler e não responder?) e o aluno pode continuar mandando mensagem?; (3) a ordem — isso entra junto da C2.

## Pacote 5 — Base para o presencial ✔ (migrations `20261028120100` e `20261028120200`, aplicadas no lfit-dev)

**O que entrou**
- `students.modality` (`consultoria` padrão | `presencial` | `hibrido`) + `students_with_status` recriada.
- `set_student_modality` (owner ou professor responsável, via `lock_accessible_student`, como as demais escritas do
  aluno). Campo "Modalidade" no formulário Novo/Editar aluno (gravado por essa RPC depois do salvar).
- Lista: etiqueta "Presencial"/"Híbrido" ao lado do status (o padrão não aparece para não repetir em toda linha) e filtro
  `?modalidade=` (links, como o de Treino). Exportação respeita o filtro (mesma consulta).
- `docs/planos/modulo-presencial.md`: proposta (presença, pacote de aulas, treino complementar no híbrido, aluno em
  risco) + riscos + o que você precisa decidir. **Nada implementado** além da base.
- **Incidente no lfit-dev:** a 1ª migration quebrou o `create_student` por alguns minutos — ele monta a linha inteira
  (`insert … values (r.*)`), então o DEFAULT não se aplicava e `modality` chegava nula. Os testes de banco pegaram; corrigi
  numa **migration nova** (gatilho `BEFORE INSERT`), sem editar a aplicada. Produção não foi tocada. **Antes de levar para
  produção, as duas vão juntas.**

**Dry-runs:** cada um listou só a migration do pacote (`…120100`, depois `…120200`), projeto `fwbpazxawtxuppuczijd`.

**SQL completo — `20261028120100_student_modality.sql`**

```sql
-- Base para o presencial (mínimo): modalidade do aluno. Só a etiqueta e o filtro — nada de agenda, presença ou cobrança
-- (proposta em docs/planos/modulo-presencial.md).
-- 1) students.modality: consultoria (padrão) | presencial | hibrido.
-- 2) students_with_status recriada: a view expandiu s.* na criação e não vê a coluna nova (mesma definição de
--    20261001120000_student_plan_filters.sql).
-- 3) set_student_modality: escrita só por RPC, como as demais do aluno (owner ou professor responsável).

alter table public.students
  add column modality text not null default 'consultoria'
  check (modality in ('consultoria', 'presencial', 'hibrido'));

drop view public.students_with_status;

create view public.students_with_status
with (security_invoker = true)
as
select
  s.*,
  public.student_effective_status(s) as effective_status,
  s.first_name || ' ' || s.last_name as full_name,
  private.immutable_unaccent(lower(s.first_name || ' ' || s.last_name || ' ' || s.email)) as search_text
from public.students s
where s.deleted_at is null;

grant select on public.students_with_status to authenticated;

create function public.set_student_modality(p_student_id uuid, p_modality text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students := private.lock_accessible_student(p_student_id);
begin
  if p_modality is null or p_modality not in ('consultoria', 'presencial', 'hibrido') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'modality';
  end if;
  update public.students set modality = p_modality, updated_at = now() where id = s.id;
end;
$$;
revoke execute on function public.set_student_modality(uuid, text) from public, anon;
grant execute on function public.set_student_modality(uuid, text) to authenticated;
```

**SQL completo — `20261028120200_student_modality_insert_default.sql`**

```sql
-- Correção de 20261028120100: create_student monta a linha inteira (jsonb_populate_record + insert ... values (r.*)),
-- então o DEFAULT da coluna nova não se aplica e modality chegava nula (NOT NULL). Gatilho BEFORE INSERT completa o
-- padrão; o NOT NULL é verificado depois dos gatilhos BEFORE. Vale para qualquer insert futuro no mesmo padrão.

create function private.student_modality_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.modality is null then
    new.modality := 'consultoria';
  end if;
  return new;
end;
$$;

create trigger students_modality_default
  before insert on public.students
  for each row execute function private.student_modality_default();
```

**Resultados (29/10/2026, build de produção em `:3100` com as chaves de teste do Turnstile):**
- Testes de banco, **arquivo por arquivo** (prazo de 5 min cada): 22/22 arquivos, **316 testes passando**
  (`student-modality` 4/4; `security-definer` 82/82, com `set_student_modality` recusada para aluno e anônimo;
  `security-definer-coverage` 1/1).
- Unitários: 30 arquivos, 274 testes passando. `tsc --noEmit` e `npm run lint` sem erros.
- e2e fase 1: 5/5 (`fase1-modalidade` 10/10; `fase1-saude-consentimento` passou com as chaves do Turnstile no `next start`,
  e a falha anterior era do ambiente, que estava sem elas).
- Vídeo 02 regravado (`tutoriais-video/02-cadastrar-aluno.webm`, 1:32).

### Suíte de banco presa por 8 h (28→29/10)

- **Sintoma:** `security-definer-coverage` ficou 30 979 s (8,6 h) sem terminar.
- **Causa raiz:** `execFileSync("npx supabase db query")` sem prazo. A chamada é síncrona: bloqueia o processo, e o
  `testTimeout` do Vitest não a interrompe. O `npx` ainda consulta o registro antes de rodar: medido em 30–40 s,
  contra 4 s com o binário local. Com o Mac suspenso, nunca voltava.
- **Correção:**
  - binário local `node_modules/.bin/supabase` + `timeout: 60 s` + `SIGKILL` (asserções iguais); agora o teste roda em
    3,6 s;
  - `e2e/run.mjs` com prazo no seed (5 min) e por roteiro (10 min);
  - `scripts/with-timeout.mjs`, porque o macOS não tem `timeout`;
  - regra 7 do "Modo autônomo" no CLAUDE.md.
- **Queda de rede às 08:35, durante a execução arquivo por arquivo:** o `pmset` registrou "Clamshell Sleep" (tampa
  fechada, na bateria), situação em que o `caffeinate` não segura. `red-flags` estourou os 5 min, e os dois arquivos
  seguintes saíram com `fetch failed`. Rodados de novo, passaram (7/7, 27/27, 38/38). Observação registrada no
  CLAUDE.md.

## Pacote 6 — Biblioteca (2.11), C1, C2 ◐ (só proposta)

- **2.11:** `docs/planos/etapa-2.11.md` + `docs/revisao/biblioteca-2.11.csv`, com **41 exercícios** novos para revisão
  (coluna "aprovar"; hoje são 54). Nenhum repete um global. Nada no banco: o conteúdo global só muda por migration
  depois da sua aprovação, e sem contraindicação nova.
- **C1/C2:** não iniciados. A C1 reescreve `current_org_id()` e o RLS do banco inteiro, e precisa de um plano aprovado. A
  C2 é cobrança (regra 3).
