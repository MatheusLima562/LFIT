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
| Componentes | Primitivas próprias em `components/ui/` (sem shadcn por enquanto) | [existe] |
| Ícones / gráficos | lucide-react / recharts | [existe] |
| Banco, Auth, Storage | Supabase (Postgres + RLS) | [planejado] |
| Validação / formulários | Zod (mesmo schema no client e no server) + React Hook Form | [planejado] |
| Dados no client | TanStack Query | [planejado] |
| Testes | Vitest (unitários) + Playwright (e2e) | [planejado] |
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

[planejado] — serão adicionados na Fase 1:

```bash
npm test                  # Vitest
npm run test:e2e          # Playwright
npx supabase db reset     # recria o banco local aplicando migrations + seed
npx supabase migration new <nome>
npx supabase gen types typescript --local > lib/db/types.ts
```

## Estrutura de pastas

Atual **[existe]**:

```
app/
  layout.tsx               # layout raiz (fontes, metadata, lang pt-BR)
  globals.css              # tokens de design (cores brand/ink/line, séries de gráfico)
  (app)/                   # área logada do treinador (usa AppShell)
    layout.tsx
    page.tsx               # dashboard "Início"
    [...slug]/page.tsx     # placeholder "Módulo em construção" para itens da sidebar
components/
  ui/                      # primitivas: Card, Dialog (<dialog> nativo), DropdownMenu, StatTabs, Tooltip...
  layout/                  # AppShell, Sidebar, Logo
  dashboard/               # cards e composição do dashboard
data/                      # mocks e configuração estática (navegação, ações rápidas)
lib/                       # utilitários (cn, format) e seletores do dashboard
types/                     # tipos compartilhados
```

Alvo **[planejado]** (spec §2) — migrar gradualmente, módulo a módulo:

```
app/                       # só rotas e composição de telas
features/<modulo>/         # components/, hooks/, schemas.ts (Zod), actions.ts (server actions), queries.ts
lib/                       # db/ (clientes Supabase, tipos gerados), auth/, utils
components/ui/             # primitivas genéricas sem regra de negócio
supabase/migrations/       # migrations versionadas
supabase/seed.sql          # dados FICTÍCIOS
messages/pt-BR.ts          # textos da UI centralizados (preparo para i18n)
```

## Convenções

- **Sem lógica de negócio em componentes.** Regras ficam em `features/<modulo>` / funções SQL.
- Um schema Zod por formulário, reutilizado no client (RHF) e na server action.
- Toda mudança de banco via **migration versionada**; seed só com dados fictícios, nunca dados reais de alunos.
- Datas: UTC no banco; exibição em `America/Sao_Paulo`, formato `dd/mm/aaaa`.
- WhatsApp salvo em E.164 (`+5541999010287`), exibido com máscara.
- Textos da UI em PT-BR, centralizados.
- Acessibilidade: foco visível, labels, contraste AA, botões são `<button>` e links são `<a>`.
- Nada de links mortos: módulo não implementado fica oculto ou desabilitado com "em breve".
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
  blocked   senão, se block_if_overdue e existe pagamento vencido
  active    caso contrário
```
- Implementado como view/função SQL usada por listagens, contadores e RLS do app do aluno.
- Ações: **Desativar** → `status = inactive` · **Expirar** → `access_expires_at = now()` ·
  **Limpar expiração** → `access_expires_at = null` · **Reativar** → valida limite do plano antes.
- **Limite do plano**: conta só `effective_status = active`. Bloquear cadastro/reativação ao atingir
  `student_limit`, com mensagem clara e CTA de upgrade.
- Job diário (cron): registra expirações e avisa o treinador sobre alunos expirando em 7 dias.

### Alunos
- Matrícula (`enrollment_number`) **gerada automaticamente**, sequencial por organização,
  `unique(organization_id, enrollment_number)`; zeros à esquerda só na exibição.
- `unique(organization_id, lower(email))` entre alunos não excluídos.
- Soft delete (`deleted_at`); exclusão definitiva só por ação explícita, confirmando pelo nome.
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
- Existe apenas o dashboard "Início" com **dados mockados** (`data/dashboard.ts`, data de referência fixa).
- Não há banco, autenticação, testes nem configuração de deploy.
- Roadmap: Fase 1 alunos → Fase 2 treinos e exercícios → Fase 3 app do aluno (PWA) → Fase 4 gestão e retenção.
