# LFit — SaaS de gestão para personal trainers

Painel web (desktop-first) para o treinador e, no futuro, app PWA (mobile-first) para o aluno.
Uso inicial interno (substituir o MFIT Personal); objetivo futuro é vender para outros personais,
por isso tudo é **multi-tenant desde o início**.

> Marcações: **[existe]** já está no repositório · **[planejado]** definido pela spec, ainda não implementado.

## Stack

| Camada | Tecnologia | Estado |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 | [existe] |
| Linguagem | TypeScript `strict` | [existe] |
| Estilo | Tailwind CSS v4 (tokens em `app/globals.css` via `@theme`) | [existe] |
| Componentes | shadcn/ui (base Radix, preset Nova) em `components/ui/*.tsx` minúsculos + componentes próprios (`Card`, `StatTabs`, `EmptyState`…); `cn` do pacote `cn` (substitui clsx + tailwind-merge) via `@/lib/utils` | [existe] |
| Tema | `next-themes` (classe `.dark`); tokens por tema em `app/globals.css` | [existe] |
| Ícones / gráficos | lucide-react / recharts | [existe] |
| Banco, Auth, Storage | Supabase (Postgres 17 + RLS), migrations em `supabase/migrations/` | [existe — schema da Fase 1] |
| Validação / formulários | Zod 4 (mesmo schema no client e no server) + React Hook Form | [existe] |
| Telefone / datas | libphonenumber-js (E.164, máscara por país) · react-day-picker (calendário) | [existe] |
| Dados no client | Server Components + Server Actions (TanStack Query **não** adotado por enquanto: sem necessidade de cache no cliente até a 1.3; reavaliar quando houver listas interativas no cliente) | — |
| Testes | Vitest (banco/RLS em `tests/db/`) · Playwright (e2e) | [existe] · [planejado] |
| Deploy | Vercel (+ Vercel Cron para jobs diários) | [planejado] |

### Particularidades do Next.js 16 (diferente do que costuma estar no treino dos modelos)
- `middleware.ts` foi **renomeado para `proxy.ts`** (a convenção antiga está deprecada).
- `params` e `searchParams` são **Promises** — sempre `await`.
- Tipos globais `PageProps<"/rota">` e `LayoutProps<"/rota">` (gerados por `next typegen`).
- Documentação local da versão instalada: `node_modules/next/dist/docs/`. Consulte antes de usar APIs novas.

## Comandos

```bash
npm run dev        # servidor de desenvolvimento (http://localhost:3000)
npm run build      # build de produção (inclui checagem de tipos)
npm run lint       # ESLint (config next/core-web-vitals + typescript)
npx tsc --noEmit   # checagem de tipos isolada
```

Banco e testes **[existe]** (precisam de `.env.local` — ver `.env.example`):

```bash
npm test                  # Vitest (testes de banco pulam se ALLOW_DB_TESTS != true)
npm run test:db           # só os testes de isolamento/regras contra o Supabase de DEV
npx supabase link --project-ref <ref>   # uma vez por máquina
npm run db:push           # aplica supabase/migrations no projeto linkado (confirme antes!)
npm run db:types          # gera lib/db/types.ts a partir do banco linkado
npm run db:seed           # dados fictícios (-- --reset para recriar)
npm run bootstrap:owner   # cria organização + owner e imprime link de convite (sem e-mail)
```

> ⚠️ **`supabase db reset` e `npm run db:seed -- --reset` só no lfit-dev, NUNCA em produção.**
> Ambos apagam dados. Antes de rodar, confirme o projeto linkado (`supabase/.temp/project-ref`)
> e o `NEXT_PUBLIC_SUPABASE_URL` do `.env.local`. O mesmo vale para `npm run test:db`
> (cria e apaga organizações; só roda com `ALLOW_DB_TESTS=true`).

[planejado]: `npm run test:e2e` (Playwright).

## Estrutura de pastas

Atual **[existe]**:

```
proxy.ts                   # (Next 16) renova a sessão Supabase e protege a área logada
app/
  layout.tsx, providers.tsx, globals.css   # tema, tooltips, toasts, tokens
  (auth)/                  # entrar, esqueci-senha, redefinir-senha, convite, criar-conta (flag),
                           # acesso/[token] (link do aluno) e acesso/pronto
  (app)/                   # área logada (requireStaff + AppShell); page.tsx = dashboard
    alunos/                # "Meus alunos" (lista/cards, filtros na URL) + exportar/route.ts (CSV/XLSX)
  auth/confirm, auth/sair  # route handlers (links de e-mail, logout forçado)
features/
  auth/                    # schemas.ts (Zod), actions.ts (server actions), components/
  organizations/queries.ts # uso do plano (RPC organization_plan_usage)
  students/                # search-params.ts (estado da URL), schemas.ts (form Zod), queries.ts, actions.ts,
                           # account.ts, access-actions.ts (link do aluno), components/ (lista, form/, modal)
components/
  ui/                      # shadcn (minúsculos) + próprios (Card, StatTabs, EmptyState, ProgressBar,
                           # data-table, confirm-dialog, password-input…)
  students/                # StatusBadge, GroupChip, StudentAvatar
  layout/                  # AppShell, Sidebar, UserMenu, ThemeToggle, Logo
  dashboard/               # cards do dashboard (ainda com dados mockados — etapa 1.6)
lib/
  db/                      # server.ts, client.ts, admin.ts (service_role, server-only), types.ts (gerado)
  auth/session.ts          # getSession / requireStaff
  security/rate-limit.ts   # rate limit via RPC hit_rate_limit
  text.ts, format.ts, utils.ts
  dates.ts                 # dd/mm/aaaa ↔ ISO, fim do dia em SP, máscara
  phone.ts                 # países (pt-BR), máscara, E.164
messages/pt-BR.ts          # textos da UI + tradução dos códigos de erro das RPCs
data/                      # navegação (status de cada módulo), ações rápidas, mocks do dashboard
supabase/migrations/       # schema, RLS e RPCs
scripts/                   # seed.mts, bootstrap-owner.mts
tests/db/                  # testes de RLS e regras (Vitest, contra o lfit-dev)
tests/unit/                # testes de lógica pura (sem banco)
```

## Convenções

- **Sem lógica de negócio em componentes.** Regras ficam em `features/<modulo>` / funções SQL.
- Um schema Zod por formulário, reutilizado no client (RHF) e na server action.
- Toda mudança de banco via **migration versionada**; seed só com dados fictícios, nunca dados reais de alunos.
- `supabase db reset` / `--reset` só no lfit-dev, nunca em produção.
- Datas: UTC no banco; exibição em `America/Sao_Paulo`, formato `dd/mm/aaaa`.
- WhatsApp salvo em E.164 (`+5541999010287`), exibido com máscara.
- Textos da UI em PT-BR, centralizados.
- Acessibilidade: foco visível, labels, contraste AA, botões são `<button>` e links são `<a>`.
- Nada de links mortos: módulo não implementado fica desabilitado com "Em breve". Em `data/navigation.ts`,
  só itens com `status: "available"` navegam; `CardLink` e o banner consultam `isAvailableRoute()`.
  Ao entregar um módulo, marque-o como `available`.
- Remover acentos: use `stripAccents`/`searchKey`/`slugify` de `lib/text.ts` (não reescreva o regex).
- Server Action que precisa levar a um Route Handler que grava cookies (ex.: `/auth/confirm`): devolva a
  URL e navegue com `window.location.assign` no cliente. `redirect()` da action faz uma busca RSC e a
  sessão não chega à página seguinte.
- Constraints (CHECK) executam com o privilégio de quem faz o UPDATE: se chamarem função do schema
  `private`, dê `grant execute` ao papel que escreve (ex.: `valid_signup_form_config`).
- Exportações: grupos especiais (dado de saúde) só com opt-in explícito (`saude=1` + confirmação na UI).
  Filtrar por grupo especial também revela saúde e exige o mesmo opt-in — regra aplicada no servidor.
- Links de uso único enviados por WhatsApp/e-mail: nunca consumir no GET (pré-visualizações fazem GET).
  Mostre um botão e consuma no POST (ver `/acesso/[token]`).
- Ações sensíveis com a secret key (Auth admin): primeiro uma RPC com a sessão do usuário autoriza e
  audita (ex.: `record_student_access_email`); só depois o `createAdminClient()`.
- Contraste AA: texto pequeno usa `ink`/`ink-2`/`ink-3`; links em `brand-700`; botão primário usa
  `bg-primary` (não `brand-500`, que só passa 3:1 — ok para ícones, barras e gráficos).
- Tema escuro: use os tokens (`surface`, `canvas`, `line`, `ink*`, `brand-*`). Os tons 50–200 e 700–800
  de emerald/amber/violet/red/teal/sky/rose/orange/zinc já são remapeados no `.dark` do globals.css.
- Commits pequenos em conventional commits (`feat:`, `fix:`, `chore:`...).
- Não instalar dependência sem justificar.
- Spec ambígua ou em conflito com o código → **parar e perguntar**.

## Regras de negócio

### Multi-tenant e papéis
- Toda tabela de negócio tem `organization_id`; isolamento por **RLS** no Postgres (nunca confiar só no front/API).
- Papéis: `owner`, `trainer`, `student`. Um owner pode ter vários trainers (módulo Equipe).

### Status do aluno (fonte única da verdade — nunca armazenar "expirado")
```
effective_status =
  expired   se access_expires_at <= now()
  inactive  senão, se status = 'inactive'
  blocked   senão, se block_if_overdue e existe pagamento pending com
            due_date + organizations.overdue_grace_days (default 5) < hoje em America/Sao_Paulo
  active    caso contrário
```
- Implementado em `public.student_effective_status()` + view `students_with_status`.
- Ações: **Desativar** → `status = inactive` · **Expirar** → `access_expires_at = now()` ·
  **Limpar expiração** → `access_expires_at = null` · **Reativar** → valida limite do plano antes.
- **Limite do plano**: ocupam vaga `effective_status in (active, blocked)` (decisão do dono: senão a
  inadimplência liberaria vagas). Bloqueados aparecem na aba Ativos com badge. Cadastro/reativação
  além de `student_limit` falha com `PLAN_LIMIT_REACHED` (UI mostra CTA de upgrade).
- Job diário (cron): registra expirações e avisa o treinador sobre alunos expirando em 7 dias.

### Alunos
- Matrícula (`enrollment_number`) **gerada automaticamente**, sequencial por organização,
  `unique(organization_id, enrollment_number)`; zeros à esquerda só na exibição.
- `unique(organization_id, lower(email))` entre alunos não excluídos.
- Soft delete (`deleted_at`); exclusão definitiva (`hard_delete_student`) só owner, confirmando pelo nome.
- Trainers só entram por convite do owner; `/criar-conta` só existe com `ALLOW_PUBLIC_SIGNUP=true`.
- "Copiar link de acesso" gera link de DEFINIR SENHA (tabela `access_links`, 30 min, uso único, só hash
  no banco) — nunca magic link de login.
- `audit_logs` para: desativar, expirar, excluir, resetar senha/acesso, alterar dados de saúde.

### Métrica de engajamento
- Engajamento = % de alunos com `effective_status = active` que têm ≥ 1 sessão registrada nos
  últimos 7 dias. A fórmula deve aparecer na UI.

## Segurança e LGPD (obrigatório)
- Grupos especiais (ex.: "Dor na Coluna"), anamnese e escala de dor são **dados de saúde**
  (dados sensíveis, LGPD art. 11) e **nunca** aparecem em URLs, logs ou e-mails.
- **Consentimento em duas etapas:** no cadastro pelo professor, ele DECLARA ter obtido o consentimento
  (`health_consent_declared_at/_by`); o aluno CONFIRMA pessoalmente no primeiro acesso
  (`health_data_consent_at`, tela `/acesso/consentimento`) ou recusa (dados de saúde apagados).
  Sem a confirmação do titular, só o professor responsável (ou o owner, se não houver professor)
  vê e altera os grupos — regra no RLS (`private.can_view_student_health`) e em `update_student`.
- No cadastro público o consentimento é do próprio aluno (checkbox) e a saúde vem em texto livre; a
  lista de grupos nunca é exposta publicamente — o owner classifica ao aprovar.
- **Nunca** armazenar ou exibir senha em texto puro. Acesso do aluno é por link de convite /
  magic link com token de uso único e expiração.
- Rate limit em login, link público de cadastro e reset.
- Direitos do titular: exportação dos dados do aluno e exclusão definitiva.
- Segredos só em `.env*` (já no `.gitignore`); `service_role` do Supabase **somente no servidor**.

## Funções SECURITY DEFINER (aviso "authenticated can execute" do Security Advisor)

Escritas em `students` não têm GRANT para `authenticated`: tudo passa por RPCs `SECURITY DEFINER` que
aplicam as regras (permissão, limite do plano, matrícula, auditoria) na mesma transação. Por isso o
Security Advisor avisa que `authenticated` executa essas funções — **é intencional e aceito**, porque
cada uma checa internamente `auth.uid()` → perfil → organização → papel antes de agir. Provas:
`tests/db/security-definer.test.ts` (aluno e anônimo recusados em todas; sem efeitos colaterais).

| Quem pode | Funções | Checagem interna |
|---|---|---|
| **Aluno (titular), de propósito** | `get_my_health_consent_request`, `respond_my_health_consent` | escopo `students.user_id = auth.uid()`; só o próprio cadastro |
| Staff (owner/trainer) | `create_student`, `log_students_export` | `private.require_staff()` |
| Staff com acesso ao aluno | `update_student`, `deactivate_student`, `reactivate_student`, `expire_student`, `clear_student_expiration`, `soft_delete_student`, `create_access_link`, `record_student_access_email`, `request_anamnesis` | `private.lock_accessible_student()`: staff + mesma org + (owner ou professor responsável) |
| Somente owner | `hard_delete_student`, `ensure_signup_link`, `regenerate_signup_token`, `approve_signup`, `approve_signups`, `reject_signups` | `private.require_owner()` |
| Leitura sem efeito | `organization_plan_usage` (vazio p/ não-staff), `can_view_student_health` (false p/ quem não acessa) | `private.is_staff()` / `private.can_access_student()` |
| **Só servidor** (`service_role`) | `consume_access_link`, `submit_public_signup`, `get_public_signup_form`, `hit_rate_limit` | sem EXECUTE para `authenticated`/`anon` (não aparecem no advisor) |

Checklist para toda função `SECURITY DEFINER` nova:
1. `set search_path = ''` e nomes totalmente qualificados.
2. Primeira linha valida o chamador (`require_staff`/`require_owner`/`lock_accessible_student` ou
   escopo por `auth.uid()`); nunca confiar em ids recebidos sem checar organização.
3. Não receber linhas inteiras (`tabela`) como argumento em função DEFINER — o chamador monta a linha
   que quiser (foi o bug de `student_effective_status`, hoje `SECURITY INVOKER`).
4. `revoke execute ... from public, anon` (os privilégios padrão já fazem isso; manter explícito) e
   `grant execute` só a quem precisa. Helpers de RLS ficam no schema `private` (fora da API).
5. Teste em `tests/db/security-definer.test.ts` com usuário `student` e anônimo.

## Auth: política de senha
- Mínimo de **10 caracteres**: configurado em *Authentication → Sign In / Providers → Email →
  Minimum password length* (projeto hospedado), em `supabase/config.toml` (local) e no schema Zod
  (`PASSWORD_MIN_LENGTH` em `features/auth/schemas.ts`).
- **Pendente (produção): ativar "Leaked password protection" (HaveIBeenPwned) — exige plano pago do
  Supabase.** Aviso `auth_leaked_password_protection` do advisor é aceito no lfit-dev.

## Decisões pendentes (rever antes de comercializar)
- **"1 e-mail = 1 conta"**: cada usuário do Auth tem um único `profile` (uma organização). Um aluno que
  treina com dois personais (duas organizações) não consegue ter acesso nas duas com o mesmo e-mail —
  hoje o convite falha com "Este e-mail já tem acesso ao LFit em outra conta". Para vender a outros
  personais, avaliar vínculo N:N usuário↔organização (ex.: `memberships`) e seleção de organização.

## Estado atual (set/2026)
- Dashboard "Início" ainda com **dados mockados** (`data/dashboard.ts`).
- Schema da Fase 1 em `supabase/migrations/` (tabelas, RLS, status efetivo, RPCs de alunos, cadastro
  público, links de acesso, storage). Regras de negócio vivem nas RPCs (`security definer`).
- Perfis (`profiles`) são criados SEMPRE pelo servidor com service_role, nunca a partir de metadados
  enviados pelo usuário. "Allow new users to sign up" deve ficar DESLIGADO no Supabase Auth.
- Autenticação do treinador pronta (login, recuperação, convite, logout, rate limit). Sem deploy ainda.
- Módulo Alunos disponível: "Meus alunos" (1.2), modal Novo/Editar (1.3, via `?novo=1` / `?editar=<id>`)
  e cadastro público (1.4: `/cadastro/[token]` + `/alunos/cadastros-publicos`, só owner). Grupos/turmas/
  equipe (1.5) aparecem como "Em breve".
- Cadastro público: honeypot → rate limit (5/h por IP, 100/h por link) → Turnstile → RPC com secret key.
  Sem chaves do Turnstile em produção, o formulário mostra "temporariamente indisponível" (fail-closed);
  em `npm run dev` usa as chaves de teste oficiais. Pendentes não ocupam vaga; dados enviados são
  descartados após aprovar/recusar. "Gerar novo link" revoga o anterior.
- Fotos: upload direto do cliente para `student-photos/{org}/{aluno}/{uuid}.{ext}` (RLS do Storage) depois
  de salvar o aluno; o banco impede `photo_path` fora da pasta do próprio aluno (CHECK).
- Expiração de acesso escolhida como data civil = válida até 23:59:59 de São Paulo daquele dia.
- Roadmap: Fase 1 alunos → Fase 2 treinos e exercícios → Fase 3 app do aluno (PWA) → Fase 4 gestão e retenção.
