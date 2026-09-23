# LFit

SaaS de gestão para personal trainers (painel do treinador + futuro app do aluno).
Stack: Next.js 16, React 19, TypeScript, Tailwind v4, shadcn/ui (Radix) e Supabase (Postgres + RLS).
Detalhes de arquitetura, convenções e regras de negócio: [CLAUDE.md](CLAUDE.md).

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do projeto Supabase de DESENVOLVIMENTO
npx supabase link --project-ref <ref>
npm run db:push              # aplica as migrations (confira o projeto linkado antes!)
npm run db:seed              # dados fictícios + usuários de exemplo
npm run dev                  # http://localhost:3000
```

Usuários do seed: `owner.seed@example.com`, `trainer1.seed@example.com`, `trainer2.seed@example.com`
(senha = `SEED_USER_PASSWORD`).

> ⚠️ `supabase db reset`, `npm run db:seed -- --reset` e `npm run test:db` apagam dados.
> Só no lfit-dev, **nunca em produção**.

## Primeiro acesso em um projeto novo

Contas não são criadas pelo site (`ALLOW_PUBLIC_SIGNUP=false`). Crie a organização e o owner com:

```bash
npm run bootstrap:owner
```

O script imprime um link de uso único para o owner definir a senha. Professores entram por
convite do owner.

## Configuração do Supabase Auth (painel do Supabase)

1. **Authentication → Sign In / Providers**: desligue **Allow new users to sign up**.
2. **Authentication → URL Configuration**: `Site URL` = URL do app; adicione
   `<URL do app>/auth/confirm` em **Redirect URLs**.
3. **Authentication → Emails → SMTP Settings**: configure SMTP próprio (o padrão tem limite
   muito baixo). Com Resend: host `smtp.resend.com`, porta `465`, usuário `resend`, senha = API key,
   remetente em domínio verificado.
4. **Authentication → Emails → Templates**: troque o link dos templates por `token_hash`
   (funciona em qualquer navegador/dispositivo):
   - **Invite user**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/convite`
   - **Reset password**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha`

   Sugestão de assunto em PT-BR: "Seu acesso ao LFit" / "Redefinir sua senha do LFit".

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:db` | Vitest (testes de banco só com `ALLOW_DB_TESTS=true`) |
| `npm run db:push` / `db:types` / `db:seed` | Migrations, tipos gerados, dados fictícios |
| `npm run bootstrap:owner` | Cria organização + owner e imprime o link de convite |
