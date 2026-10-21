# Variáveis de ambiente (Vercel) — só nomes

Levantamento de 21/10/2026, feito no código (`app/`, `components/`, `features/`, `lib/`, `proxy.ts`, `next.config.ts`,
`scripts/`, `e2e/`, `tests/`). **Nenhum valor aqui** — valores ficam só no `.env.local` (fora do git) e no painel da
Vercel. O `.env.example` não foi lido nesta revisão (regra de leitura de `.env*`): conferir à mão se lista os mesmos
nomes e nenhum valor real.

## App (Vercel: Production e Preview)

| Nome | Pública (`NEXT_PUBLIC_`) ou só servidor | Obrigatória no build | Obrigatória em runtime | Onde é usada |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública | **sim** — vai embutida no bundle do navegador e a CSP (`next.config.ts`) é calculada no build | sim | `lib/db/client.ts` (navegador), `lib/db/server.ts`, `lib/db/admin.ts`, `proxy.ts`, `next.config.ts` (CSP via `lib/security/headers.ts`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | pública (chave publicável, protegida pelo RLS) | **sim** (bundle do navegador) | sim | `lib/db/client.ts`, `lib/db/server.ts`, `proxy.ts` |
| `SUPABASE_SECRET_KEY` | **só servidor** (ignora o RLS) | não | sim | `lib/db/admin.ts` (`import "server-only"`), usado por Auth admin, rate limit, cadastro público, links de acesso, URLs assinadas de mídia/foto |
| `NEXT_PUBLIC_SITE_URL` | pública (endereço do site) | não | **sim em produção** (sem ela, os links de convite/acesso/cadastro usam o cabeçalho `Host` da requisição) | `features/auth/actions.ts`, `features/students/actions.ts`, `app/(app)/alunos/cadastros-publicos/page.tsx` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | pública (chave do widget) | não (lida no servidor) | sim em produção (sem ela o cadastro público fica "temporariamente indisponível") | `features/signup/turnstile.ts` (`server-only`) |
| `TURNSTILE_SECRET_KEY` | **só servidor** | não | sim em produção (idem) | `features/signup/turnstile.ts` (`server-only`) |
| `ALLOW_PUBLIC_SIGNUP` | só servidor (flag) | não | não (padrão desligado; só `"true"` abre `/criar-conta`) | `app/(auth)/criar-conta/page.tsx`, `features/auth/actions.ts` |
| `NODE_ENV` | definida pelo Next/Vercel | — | — | `features/signup/turnstile.ts` (chaves de teste só fora de produção), `next.config.ts` (CSP de desenvolvimento) |

## Só desenvolvimento (NUNCA configurar na Vercel)

| Nome | Para quê | Onde |
|---|---|---|
| `ALLOW_DB_TESTS` | libera seed, seed de demonstração, testes de banco e roteiros e2e — só com a URL do lfit-dev (`scripts/dev-guard.mts`) | `scripts/`, `tests/db/helpers.ts`, `e2e/_guard.mjs` |
| `SEED_USER_PASSWORD` | senha das contas fictícias do seed (12+ caracteres) | `scripts/seed.mts`, `e2e/*.mjs` |
| `BASE`, `OUT` | URL e pasta de capturas dos roteiros e2e e dos vídeos de tutorial | `e2e/` |

## Verificação de segurança (21/10/2026)

- **Segredo com prefixo `NEXT_PUBLIC_`: nenhum.** As quatro públicas são URL do Supabase, chave publicável do Supabase
  (feita para o navegador; a proteção é o RLS), URL do site e chave do widget do Turnstile (feita para o navegador).
- **`service_role`/`SUPABASE_SECRET_KEY` em código do navegador: nenhum.** Só `lib/db/admin.ts` lê a chave, com
  `import "server-only"` (o build falha se um componente cliente importar), e nenhum arquivo `"use client"` importa
  `createAdminClient`. Quem o usa: `features/*/actions.ts` (server actions), `features/*/queries.ts` (`server-only`),
  `lib/media.ts`, `lib/security/rate-limit.ts`.
- **Atenção:** em produção, defina `NEXT_PUBLIC_SITE_URL`. Sem ela, os links enviados por e-mail/WhatsApp são montados a
  partir do cabeçalho `Host` (risco de link apontando para outro domínio se a lista de redirecionamentos do Supabase
  Auth não estiver restrita). Ver `docs/producao-checklist.md`.
