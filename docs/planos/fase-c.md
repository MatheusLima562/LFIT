# Plano: Comercialização (personal pagante × aluno) — "Fase C"

## Contexto
Hoje o LFit é de uso interno: 1 organização criada por script (`bootstrap:owner`), 1 usuário = 1 perfil = 1 organização
(`profiles.organization_id/role`), e `/criar-conta` fica atrás da flag `ALLOW_PUBLIC_SIGNUP`. Para vender a outros personais
precisamos de: autocadastro do personal com trial, assinatura com regras de acesso validadas no banco, cobrança
plugável (gateway a decidir), vínculo de uma conta em várias organizações (decisão pendente "1 e-mail = 1 conta"),
um admin da plataforma e os documentos legais (LFit = operador; personal = controlador).

**Decisões já tomadas por você:** após a carência, **alunos perdem o acesso junto** · trial de **14 dias com limites
do Pro** · **sem Free permanente** (só Pro e Gold pagos; `free` fica como tier técnico/cortesia).

**Divisão e ordem aprovadas:** terminar 2.6/2.7 → **C1** → Fase 3 mínima → Importação do MFIT → **C2** → 1.6 → 1.7.
- **C1 (antes da Fase 3):** apenas o modelo de contas com múltiplos vínculos (seção C1 abaixo) + seletor de vínculo no
  login + revisão de RLS e testes de isolamento. **Nada de cobrança.**
- **C2 (depois da Fase 3 e da Importação do MFIT):** autocadastro do personal, trial, assinatura e regras de acesso,
  PaymentProvider/Asaas, "Minha assinatura", platform_admin, termos em rascunho (seções C2 a C7).

## Diagnóstico do código (o que muda)
- Todo o RLS passa por `private.current_org_id()` e `private.current_user_role()` (`20260923140300_rls.sql`), que leem
  a única linha de `profiles`. **Trocar essas duas funções** muda a base de tudo sem reescrever as ~70 políticas e RPCs.
- `students.user_id` é `unique` global → vira `unique (organization_id, user_id)` (o mesmo usuário pode ser aluno de dois personais).
- FKs compostas `students.trainer_id` e `classes.trainer_id → profiles(id, organization_id)` passam a apontar para `memberships`.
- Funções do titular (`get_my_health_consent_request`, `respond_my_health_consent`, `student_can_read_exercise_media`) filtram por
  `s.user_id = auth.uid()` → passam a exigir também `s.organization_id = current_org_id()`.
- App: `lib/auth/session.ts` (`getSession`/`requireStaff`), `features/auth/actions.ts` (login, `/criar-conta`), `features/students/account.ts`
  (convite do aluno cria `profiles`), `scripts/seed.mts` e `scripts/bootstrap-owner.mts` inserem `profiles`.

## Desenho

### C1. Vínculos (várias organizações por conta)
- **`memberships`** (`user_id`, `organization_id`, `role owner|trainer|student`, `created_at`, `unique(user_id, organization_id)`).
  `profiles` passa a ser só a pessoa (nome, avatar, preferências). Migration copia os perfis atuais para `memberships`.
- **Vínculo ativo por sessão**: tabela `session_contexts(session_id pk, user_id, organization_id)`, usando o claim
  `session_id` do JWT do Supabase (sem hook de Auth, sem mudar configuração). `current_org_id()` = vínculo escolhido
  nesta sessão, ou o único vínculo quando só há um. Com dois vínculos e nada escolhido → nenhum acesso até escolher
  (fail-closed). Cada dispositivo/login escolhe o seu, e duas sessões não interferem entre si.
- RPCs `list_my_memberships()` e `set_active_membership(org)`: validam que o vínculo existe e ficam só na sessão do próprio usuário.
- Tela `/escolher-conta` depois do login quando há mais de um vínculo; troca de conta no menu do usuário.
- Aluno de dois personais = duas linhas em `students`, uma por organização (dados, consentimento e saúde separados).

### C2. Assinatura e regras de acesso (tudo no banco)
- **`plan_tier_limits`** (já existe) ganha `student_limit` e `price_cents`. **`billing_settings`** (linha única):
  `trial_days = 14`, `past_due_grace_days = 7`. Valores editáveis, nada fixo no código.
- **`subscriptions`** (1 por organização): `plan`, `status trialing|active|past_due|canceled`, `trial_ends_at`,
  `current_period_ends_at`, `past_due_since`, `cancel_at_period_end`, `provider`, `provider_customer_id`,
  `provider_subscription_id`. `organizations.student_limit` passa a ser **exceção opcional** (nulo = limite do plano),
  e as funções atuais de limite passam a usar `private.org_student_limit()`.
- **`private.org_access(org)`**, calculada por datas (não depende de job):
  - `full`: `trialing` dentro do trial, `active`, `past_due` dentro da carência (com aviso) e `canceled` até o fim do período pago;
  - `read_only`: depois da carência, com o trial vencido sem pagamento contado como `past_due` a partir de `trial_ends_at`.
- **Escrita bloqueada no banco**: `private.require_staff()`, `require_owner()` e `lock_accessible_student()` passam a
  exigir `full`, o que cobre todas as RPCs. As políticas de INSERT/UPDATE/DELETE das tabelas escritas direto (grupos,
  turmas, exercícios, condições, contraindicações, fotos e vídeos no Storage) ganham `and (select private.org_writable())`.
  Leitura continua liberada para o personal.
- **Alunos após a carência (decisão sua): perdem acesso.** `private.org_serves_students()` entra nas funções e políticas
  do aluno (consentimento, mídia e, na Fase 3, treino do dia e registro). Durante a carência nada muda para eles.
- Tabelas e RPCs de cobrança: só **owner** lê; escrita só por `service_role` (webhook). Aluno e trainer não têm acesso.

### Pendências a revisar antes/durante a C2
- Admin da plataforma entra por **login normal** + tabela `platform_admins`; **nunca** usar `service_role` no navegador
  (substitui a ideia de "entrar pela service_role" da seção C6).
- **Emissão de NFS-e** pelo gateway (o Asaas emite) — configurar junto com a contratação.
- **Política de retenção, exportação e exclusão de dados** após o cancelamento do personal (prazos, aviso, exportação
  para o personal e exclusão definitiva) — refletir nos Termos e na Política de Privacidade.
- **Job de limpeza de `session_contexts`** expiradas (sessões encerradas/antigas).
- **Reavaliar** a regra pós-carência: aluno "só visualiza o último treino" em vez de perder acesso total.

### C3. Cadastro público do personal (`/cadastro-personal`)
- Campos: nome, e-mail, WhatsApp (E.164, reaproveita `PhoneField`/`lib/phone.ts`), CREF opcional
  (formato `000000-G/UF` ou `-P/UF`), senha (mín. 10, `PASSWORD_MIN_LENGTH`), aceite dos Termos e da Política.
- Proteções iguais ao cadastro de aluno: honeypot → `hit_rate_limit` → Turnstile (`features/signup/turnstile.ts`) → servidor.
- Fluxo: o servidor cria o usuário **não confirmado** pela Admin API (o cadastro direto no Auth continua desligado),
  grava `personal_signups` (nome, WhatsApp, CREF, versões aceitas) e o Supabase envia o e-mail de confirmação.
  No `/auth/confirm` (`verifyOtp`), a RPC `complete_personal_signup` (só `service_role`) cria a organização, a
  assinatura `trialing` (Pro, 14 dias), o vínculo `owner` e registra `terms_acceptances` (documento, versão, data).
  Primeiro acesso só depois de confirmar o e-mail.
- **Risco a validar logo no início:** confirmar que a Admin API envia o e-mail de confirmação com o cadastro público
  desligado (`generateLink` + reenvio). Se não enviar, a alternativa é um e-mail próprio via Resend. Depende do SMTP.
- Sai a flag `ALLOW_PUBLIC_SIGNUP` e a rota `/criar-conta`. `bootstrap:owner` continua para contas internas/cortesia.

### C4. Cobrança plugável (sem gateway por enquanto)
- `lib/billing/provider.ts`: interface `PaymentProvider` com `createCustomer`, `createSubscription(plan, método)`,
  `changePlan`, `cancel` e `parseWebhook(req)` (verifica a assinatura e devolve um evento normalizado).
- `FakeProvider` (HMAC com segredo de teste) para desenvolvimento e testes, sem cobrar nada.
- Webhook `POST /api/billing/webhook/[provider]`: verificação de assinatura → **idempotência** em `billing_events`
  (`unique(provider, event_id)`) → RPC `apply_billing_event` (só `service_role`) que atualiza `subscriptions`
  e `audit_logs`. Evento repetido é aceito e ignorado; assinatura inválida → 401, sem gravar nada.

**Opções de gateway para você decidir** (taxas de fontes públicas, **confirmar na contratação**):

| | Asaas | Mercado Pago | Stripe (Brasil) |
|---|---|---|---|
| Cartão recorrente | ~1,99% + R$ 0,49 por cobrança | ~3,99% (recebe em 30 dias) a 4,99% (na hora) | ~3,99% + R$ 0,39 |
| Pix | R$ 1,99 por Pix recebido (R$ 0,99 nos 3 primeiros meses) | na assinatura, conforme o ciclo | ~1,19%, mas **só para convidados** |
| Boleto | R$ 3,49 | sim | não |
| Prós | feito para cobrança recorrente no Brasil; assinatura nativa com Pix, boleto e cartão; régua de cobrança e reenvio; custo menor no cartão | marca conhecida pelo aluno e pelo personal; checkout pronto | melhor API e documentação; Billing completo (portal do cliente, prorrateio); webhook com HMAC |
| Contras | webhook autenticado por token no cabeçalho, sem HMAC (exige cuidado extra: token + IP de origem + idempotência) | API de assinaturas mais limitada; taxa alta para receber rápido | Pix restrito; mais caro no cartão nacional; sem boleto |

**Recomendação:** Asaas, pelo custo e por Pix, boleto e cartão recorrentes nativos no Brasil. A interface
`PaymentProvider` permite trocar depois.

### C5. Telas
- `/assinatura` (só owner): plano, status, próxima cobrança, uso × limites (alunos, vídeos), trocar plano e cancelar
  (pelo provedor; até haver um, ações do FakeProvider só em dev).
- Aviso no topo (AppShell): fim do trial chegando, `past_due` na carência e modo somente leitura. Botões de criar/editar
  ficam desabilitados em `read_only` (`session.access`), mas a regra que vale é a do banco.
- Aluno nunca vê cobrança; após a carência vê "acesso suspenso — fale com seu personal".
- `/admin` (admin da plataforma): lista organizações com plano, status, nº de alunos ativos e data de cadastro.

### C6. Admin da plataforma
- Tabela `platform_admins(user_id)`, separada de `memberships`: não é papel de organização. Você entra pela
  service_role e o botão de acesso fica só no `/admin`.
- RPC `admin_list_organizations()` (DEFINER, checa `is_platform_admin()`): só agregados (contagens, datas, plano/status).
  **Sem acesso a alunos, grupos, anamnese ou planos**; nenhuma política de dados de organização considera o admin.

### C7. LGPD
- `docs/legal/termos-de-uso.md` e `docs/legal/politica-de-privacidade.md`, marcados **"RASCUNHO — revisar com advogado"**:
  personal = controlador dos dados dos alunos; LFit = operador (subprocessadores: Supabase, Vercel, Resend e o gateway);
  dados de saúde (art. 11), retenção, direitos do titular e encarregado.
- Versões no código (`lib/legal.ts`). O aceite é registrado com documento, versão e data, e um aceite novo é exigido quando a versão muda.

## Etapas e checkpoints
- **C.1 Banco** (migrations aditivas, com dry-run): `memberships` + `session_contexts` + novas `current_org_id()`/`current_user_role()`;
  unicidade de `students.user_id` por organização; FKs de trainer; `subscriptions`, `billing_settings`, limites do plano,
  `org_access`/`org_writable`/`org_serves_students` aplicadas em RPCs e políticas; `personal_signups`, `terms_acceptances`,
  `billing_events`, `platform_admins`; RPCs novas; seed com uma org em cada status (trialing, active, past_due na carência,
  past_due vencida, canceled) e um usuário com dois vínculos (aluno de duas orgs e personal que também é aluno).
  **→ CHECKPOINT: migrations, RLS e testes.**
- **C.2** Cadastro do personal + confirmação de e-mail + criação da organização (depende de SMTP e Turnstile para testar ponta a ponta).
- **C.3** Seletor de conta (login, `/escolher-conta`, troca no menu); `getSession`/`requireStaff` passam a ler o vínculo ativo.
- **C.4** Assinatura: `/assinatura`, avisos, modo somente leitura na interface, tela de acesso suspenso do aluno.
- **C.5** `PaymentProvider` + FakeProvider + webhook com assinatura e idempotência.
- **C.6** `/admin` da plataforma.
- **C.7** Rascunhos legais + versão/aceite.
- **C.8** Verificação final (roteiros de navegador, claro/escuro/mobile, advisors). Commit por etapa.

## Testes de banco (novos)
- Isolamento: personal A não lê nem escreve na org B (tabelas, RPCs e Storage); **usuário com dois vínculos só vê o
  vínculo ativo da sessão** e, sem vínculo escolhido, não vê nada; duas sessões do mesmo usuário com orgs diferentes não se misturam.
- Cobrança: aluno e trainer não leem `subscriptions`, `billing_events` nem as RPCs de cobrança; apenas `service_role` aplica eventos.
- Acesso: org `past_due` **dentro** da carência escreve; **depois** da carência, toda RPC de escrita e toda escrita direta
  (incluindo upload no Storage) falha, a leitura funciona e **o aluno perde o acesso**; trial vencido sem pagamento segue a mesma regra.
- Webhook: assinatura inválida → recusado, nada gravado; evento repetido → uma única aplicação.
- Admin: `admin_list_organizations` só para admin da plataforma e sem colunas de dados pessoais ou de saúde.
- Regressão: toda a suíte atual (hoje 226 testes) precisa continuar passando depois da troca de `current_org_id()`.

## Pré-requisitos que dependem de você
1. **SMTP próprio (Resend)** no Supabase Auth + templates com `token_hash` (confirmação de cadastro, convite, recuperação).
2. **Chaves do Turnstile** de produção (site key e secret).
3. **Conta no gateway escolhido** (sandbox + produção) e segredo/token do webhook.
4. **Projeto `lfit-prod`** no Supabase (com a proteção de senhas vazadas do plano pago) e deploy na Vercel com domínio.
5. **Revisão jurídica** dos Termos e da Política antes de abrir o cadastro público.

## Verificação
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (banco + unitários) sem falhas; Security Advisor com as novas funções
  documentadas na tabela do CLAUDE.md.
- Roteiros de navegador: cadastro do personal → e-mail de confirmação (Resend) → primeiro acesso já em trial; usuário com dois
  vínculos escolhendo e trocando de conta; org na carência (aviso) e depois dela (somente leitura; aluno suspenso); webhook
  do FakeProvider mudando o status; `/admin` listando organizações.
- Registrar no CLAUDE.md: modelo de vínculos, regras de acesso, cobrança plugável e a decisão pendente resolvida.
