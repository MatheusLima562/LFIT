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
| Dados no client | TanStack Query | [planejado] |
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
  students/                # search-params.ts (estado da URL), queries.ts, actions.ts, account.ts,
                           # access-actions.ts (resgate do link do aluno), components/
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
  (dados sensíveis, LGPD art. 11): exigem consentimento explícito com data (`consent_at`),
  RLS restrita ao treinador responsável + owner, e **nunca** aparecem em URLs, logs ou e-mails.
- **Nunca** armazenar ou exibir senha em texto puro. Acesso do aluno é por link de convite /
  magic link com token de uso único e expiração.
- Rate limit em login, link público de cadastro e reset.
- Direitos do titular: exportação dos dados do aluno e exclusão definitiva.
- Segredos só em `.env*` (já no `.gitignore`); `service_role` do Supabase **somente no servidor**.

## Estado atual (set/2026)
- Dashboard "Início" ainda com **dados mockados** (`data/dashboard.ts`).
- Schema da Fase 1 em `supabase/migrations/` (tabelas, RLS, status efetivo, RPCs de alunos, cadastro
  público, links de acesso, storage). Regras de negócio vivem nas RPCs (`security definer`).
- Perfis (`profiles`) são criados SEMPRE pelo servidor com service_role, nunca a partir de metadados
  enviados pelo usuário. "Allow new users to sign up" deve ficar DESLIGADO no Supabase Auth.
- Autenticação do treinador pronta (login, recuperação, convite, logout, rate limit). Sem deploy ainda.
- Módulo Alunos disponível: "Meus alunos" (1.2). Novo/editar aluno (1.3), cadastro público (1.4) e
  grupos/turmas/equipe (1.5) aparecem como "Em breve".
- Roadmap: Fase 1 alunos → Fase 2 treinos e exercícios → Fase 3 app do aluno (PWA) → Fase 4 gestão e retenção.
