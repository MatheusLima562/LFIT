# Checklist de produção — passos que dependem do dono

Tudo aqui exige conta, pagamento, DNS ou aprovação do dono; nada foi feito automaticamente. Ordem sugerida de cima para
baixo. O projeto **lfit-prod nunca foi tocado** pelo assistente: migrations, seed e testes só rodam no lfit-dev (trava em
`scripts/dev-guard.mts`).

## 1. Supabase (produção)

- [ ] Criar o projeto **lfit-prod** no plano **Pro** (backups diários e PITR opcional; o plano grátis pausa por
      inatividade e não tem backup).
- [ ] **Região:** `sa-east-1` (São Paulo) — latência e LGPD (transferência internacional, art. 33). Confirmar com o
      advogado se outra região for escolhida.
- [ ] **Auth:** desligar "Allow new users to sign up"; senha mínima de **10** caracteres; ligar **Leaked password
      protection** (só no plano pago); **Site URL** = domínio de produção; **Redirect URLs** só com o domínio de produção
      (sem curingas) — isso também limita links montados a partir do cabeçalho `Host`.
- [ ] **E-mail (SMTP próprio):** configurar o provedor (ex.: Resend, SES, Postmark) em Auth → SMTP; o SMTP padrão do
      Supabase só envia para a equipe. Ajustar os modelos de e-mail (convite, recuperação) com o nome do app de
      `features/brand/config.ts` e **sem** dado de saúde ou conteúdo de chat.
- [ ] **Storage:** conferir que os buckets `student-photos` e `exercise-media` foram criados pelas migrations, privados.
- [ ] **Realtime:** conferir a publicação `supabase_realtime` só com `chat_messages` (vem da migration).
- [ ] Rodar o **Security Advisor** e o **Performance Advisor** depois das migrations; os avisos "authenticated can
      execute" das funções SECURITY DEFINER estão documentados no `CLAUDE.md` (aceitos).

## 2. Migrations em produção (com dry-run)

1. [ ] Backup antes (Pro: backup manual em Database → Backups).
2. [ ] `npx supabase link --project-ref <ref do lfit-prod>` — **atenção:** enquanto estiver linkado ao prod, seed, testes
       de banco e e2e recusam rodar (a trava confere o projeto linkado). Voltar a linkar o lfit-dev depois.
3. [ ] `npx supabase db push --dry-run` e conferir a lista inteira (primeira vez: todas as migrations, em ordem de
       timestamp).
4. [ ] `npx supabase db push`.
5. [ ] `npx supabase link --project-ref fwbpazxawtxuppuczijd` (volta ao lfit-dev).
6. [ ] **Nunca** rodar `db reset`, `db:seed`, `db:seed:demo` ou testes de banco contra o prod (a trava recusa).
7. [ ] Criar o owner real com `npm run bootstrap:owner` apontando para o prod (só esse script; confere o que ele faz
       antes — cria organização + owner e imprime o link de convite).

## 3. Cloudflare Turnstile

- [ ] Criar o site no painel do Turnstile com o domínio de produção; copiar as chaves de **produção** (não as de teste).
- [ ] Sem as chaves, o cadastro público fica "temporariamente indisponível" (fail-closed) — comportamento esperado.

## 4. Vercel

- [ ] Criar o projeto a partir do repositório (framework Next.js). Região das funções: **São Paulo (`gru1`)**, perto
      do Supabase.
- [ ] Variáveis de ambiente (nomes e onde usar em `docs/vercel-variaveis.md`): `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (marcar como sensível), `NEXT_PUBLIC_SITE_URL`,
      `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (sensível). **Não** configurar `ALLOW_DB_TESTS`,
      `SEED_USER_PASSWORD` nem `ALLOW_PUBLIC_SIGNUP`.
- [ ] As variáveis `NEXT_PUBLIC_SUPABASE_*` precisam existir **no build** (vão para o bundle e para a CSP): ao trocar,
      fazer novo deploy.
- [ ] Preview: usar o **lfit-dev** (nunca o prod) nas variáveis do ambiente Preview.
- [ ] Vercel Cron (job diário de expiração, etapa 1.6) — quando existir.

## 5. DNS e domínio

- [ ] Registrar o domínio definitivo (o nome do app ainda é provisório: trocar em `features/brand/config.ts` antes).
- [ ] Apontar o domínio para a Vercel (CNAME/A) e conferir HTTPS automático.
- [ ] Domínio de e-mail: SPF, DKIM e DMARC do provedor SMTP.
- [ ] Atualizar Site URL/Redirect URLs do Supabase Auth e o Turnstile para o domínio final.

## 6. Jurídico e conteúdo

- [ ] Revisão do advogado: `/privacidade` e `/termos` (rascunhos em `features/legal/texts.ts`, com os pontos
      **[em aberto]**), base legal do chat e da triagem (`docs/planos/fase-c.md`, C7), papel controlador/operador,
      encarregado (DPO), prazos de guarda, transferência internacional.
- [ ] Depois da revisão, tirar o aviso de rascunho e liberar a indexação das duas páginas.

## 7. Antes de abrir para alunos reais

- [ ] Importação do MFIT (etapa obrigatória, ver roadmap no `CLAUDE.md`).
- [ ] `npm run build` limpo, `npm test` e os e2e no build de produção contra o **lfit-dev**.
- [ ] Backup automático conferido e um restore de teste feito no lfit-dev.
- [ ] Monitoramento de erros (ex.: Sentry) sem enviar corpo de chat, dado de saúde ou comentários — decidir provedor.
- [ ] CSP com nonce (hoje `'unsafe-inline'` em scripts; ver backlog no `CLAUDE.md`).
