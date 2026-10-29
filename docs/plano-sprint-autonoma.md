# Sprint autônoma (28/10/2026) — plano

Execução em pacotes, um de cada vez, na ordem abaixo. Limites: só lfit-dev (`fwbpazxawtxuppuczijd`, único em
`ALLOWED_DEV_PROJECT_REFS`), sem `git push`, sem ler/escrever `.env*`, sem `rm`; `db push` só depois de um
`--dry-run` que liste apenas as migrations novas do pacote; nada de dado de saúde em log, URL, notificação ou texto de
erro. Andamento e resultados em `docs/relatorio-sprint.md`; decisões tomadas sozinho em `docs/decisoes-autonomas.md`.

**Pronto =** migration (se houver) com RLS e SECURITY DEFINER na tabela do CLAUDE.md (o teste de cobertura cobra);
testes de banco (anônimo, outra organização, professor sem acesso ao aluno); UI em 375 px; e2e relevantes no build de
produção (`next start -p 3100`); tutorial atualizado se a tela do professor mudou; commit local; SQL completo no
relatório.

Estado inicial: todas as migrations locais aplicadas no lfit-dev (`supabase migration list --linked`, inclusive
`20261017120000`).

## 1. Estabilidade (sem migration)

- (a) **Primeiro login após recriar os dados de teste.** Causa: limite do Supabase Auth hospedado (`sign_in_sign_ups`,
  30 logins a cada 5 min por IP). O seed faz 4 logins por `--reset`; roteiros em série estouram. O app mostrava o 429 como
  "E-mail ou senha incorretos". Correção: `signInErrorMessage` (429 → "Muitas tentativas"), roteiros com menos logins
  (reuso de cookies) e diagnóstico do login (`e2e/_login.mjs`), aviso do executor.
- (b) **"This page couldn't load" no montador.** Causa: server action rejeitada (rede, servidor reiniciado, versão nova)
  dentro de `startTransition` sobe ao error boundary; sem `error.tsx`, cai na tela global do Next. Correção:
  `callAction` (aviso e a tela continua) nas chamadas do montador + `error.tsx` no painel e no app do aluno. e2e
  `m28-falha-rede`.
- (c) **`chat_unread_count` repetido.** Agendador puro (junta pedidos, 2 s de intervalo mínimo, nada com a aba oculta),
  estado compartilhado por conversa (um canal e uma busca para todos os selos), marcação de lida sem repetir o mesmo
  ponto. Achado no caminho: o canal do selo entrava no Realtime antes de a sessão carregar (como `anon`) e era recusado
  ("invalid column for filter student_id") — o selo nunca recebia o Realtime. Correção: `joinWithAuth`.
- (d) **`get_chat_messages` sem acesso devolve vazio:** avaliar; só mudar se não quebrar o cliente.
- (e) **Minimizar `sender_id` para o aluno:** só se algum plano já descrevia.

## 2. Etapa 3.3 enxuta (migration `20261028120000_coach_reply_health_end_announcement.sql`)

- `reply_to_session` passa a exigir `private.can_view_student_health` no servidor (decisão do dono em
  `docs/planos/etapa-2.12-paginas.md`: owner sem acesso à saúde não vê nem responde ao feedback). Sem acesso →
  `SESSION_NOT_FOUND` (não confirma que a sessão existe).
- `end_trainer_announcement(p_announcement_id)`: só o autor encerra (`active = false`); de outro autor, de outra org,
  inexistente → `ANNOUNCEMENT_NOT_FOUND`.
- Telas: em `/alunos/[id]/treinos`, "Recado para este aluno" (criar até 300, expira em 7 dias, "Encerrar") e "Sessões
  recentes" (data, divisão, RPE, comentário; campo de resposta só para quem vê a saúde — a regra que vale é a da RPC).
  No `/chat`, "Recado para todos os meus alunos" com "Encerrar". Texto do recado e da resposta **do navegador direto para
  a RPC** (nunca server action, nunca log).
- Adiado: foto do professor, bucket de avatar, horário de atendimento avançado.
- Testes de banco: anônimo, aluno, outra organização, professor sem acesso ao aluno, owner sem acesso à saúde (resposta
  recusada), encerrar só o autor. e2e `k212-professor` (375 px no lado do aluno).

## 3. Notificações N1 (dentro do app, sem push)

- Selo de não lidas já existe (aba Chat / menu Chat) — agora com o Realtime funcionando (pacote 1).
- Aviso "Nova mensagem" (toast, **sem conteúdo nem nome**) quando a contagem sobe fora da conversa; "Novo recado" com
  marcador na aba Hoje do aluno até ele ver o recado (id do último recado visto no `localStorage`, nada de texto).
- Sem migration (o recado é lido por `get_my_announcement` na volta à aba/abertura; Realtime de recado fica para depois).

## 4. Chat e inadimplência

- O pedido diz "professor em somente leitura após a carência; alunos NÃO perdem acesso". O CLAUDE.md e
  `docs/planos/fase-c.md` registram o oposto ("os alunos perdem o acesso") e a regra depende da C2 (assinaturas,
  `past_due`), que não existe. Conflito de regra de cobrança → **não implementar**; registrar em Pendências.

## 5. Base para o presencial (migration `20261028120100_student_modality.sql`)

- `students.modality text not null default 'consultoria' check in ('consultoria','presencial','hibrido')`; recriar
  `students_with_status` (o `s.*` é congelado na criação).
- RPC `set_student_modality(p_student_id, p_modality)` — `lock_accessible_student` (owner ou professor responsável, como
  as demais escritas do aluno); sem auditoria (não é ação sensível da lista).
- Etiqueta na lista de alunos e filtro `?modalidade=`. Nada de agenda, presença ou cobrança.
- `docs/planos/modulo-presencial.md`: proposta (presença, pacote de aulas, treino complementar, aluno em risco) + riscos.

## 6. Biblioteca (2.11), C1, C2 — só se sobrar contexto, nessa ordem.
