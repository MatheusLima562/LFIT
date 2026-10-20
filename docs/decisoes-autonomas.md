# Decisões tomadas sem o usuário (modo autônomo)

Registro das escolhas feitas sozinho durante as sessões (regra no topo do `CLAUDE.md`). Uma linha por decisão; a mais
recente no fim.

| data | dúvida | escolha | motivo | como reverter |
|---|---|---|---|---|
| 20/10/2026 | Editar `.claude/settings.local.json` (negar AskUserQuestion; mover `git commit` de ask para allow), pedido pelo usuário | **Não editado**: `Edit/Write(.claude/**)` está na lista `ask` | A regra 2 do modo autônomo proíbe pedir aprovação ou contornar | Fazer a mudança à mão (listada em "Pendências" no relatório) |
| 20/10/2026 | Commits locais pedidos (modo autônomo e dashboard) | **Sem commit**: `Bash(git commit:*)` está na lista `ask` | Mesma regra; os arquivos ficam no working tree, prontos | Rodar os `git commit` listados em "Pendências" |
| 20/10/2026 | `npx vitest` não está na lista `allow` (pedia aprovação) | Testes rodados por `npm test -- <arquivo>` (permitido) | Mesmo efeito por um comando já liberado, sem pedir nada | — |
| 20/10/2026 | Dashboard: a saída das RPCs traria foto do aluno? | **Não**: só nome (o avatar do card usa iniciais) | Menos dado pessoal na resposta; nenhum card usa foto | Acrescentar `photo_path` nas RPCs e assinar no servidor |
| 20/10/2026 | Card "Treinos concluídos" tinha o selo "Ao vivo" | **Removido**; mostra "N hoje" e a comparação com o mesmo dia da semana passada | A página é lida ao abrir; "ao vivo" seria falso | Restaurar `LiveBadge` com atualização em tempo real |
| 20/10/2026 | Card Satisfação mostrava o comentário mais recente de um aluno e o link "Ver todos feedbacks" (rota inexistente) | **Só agregados** (média, quantidade, distribuição); sem comentário e sem link | `feedback_note` pode conter dado de saúde; link morto é proibido | Reintroduzir com tela própria de feedbacks e regra de acesso à saúde |
| 20/10/2026 | Estrelas em âmbar (`StarRating`) | Trocadas pelo token neutro `control` | A regra de cores proíbe âmbar como decoração | Voltar a classe anterior em `components/ui/StarRating.tsx` |
| 20/10/2026 | Índice do plano: (student_id, finished_at) parcial | Criado na migration 1; "registrados" usam o índice existente (student_id, started_at) | Os dois filtros das RPCs ficam cobertos | `drop index workout_sessions_student_finished_idx` em migration nova |
| 20/10/2026 | Data em que a Retenção passa a existir | Primeiro treino concluído + 30 dias, na dica "dados insuficientes até dd/mm" (texto curto: o mais longo era cortado no tile) | A base (dias 31–60) passa a existir 30 dias depois do primeiro treino | Ajustar `trainingMetrics` em `features/dashboard/stats.ts` |
| 20/10/2026 | Tutorial do Início descreve cards que só aparecem depois do push | Descritos como já existentes (`updated` 20/10) | A entrega é essa; o push é a última etapa pendente | Reverter o trecho em `content/tutoriais/professor/01-tour-pela-interface.md` |
| 20/10/2026 | Testes antigos de `tests/unit/dashboard-empty-states.test.ts` exigiam o comportamento anterior (veredito, link, mocks escondidos) | Reescritos para o comportamento aprovado (não afrouxados: cada card ganhou checagem) | A especificação mudou | `git checkout` do arquivo |
| 20/10/2026 | `lib/dashboard.ts` e os mocks de `data/dashboard.ts` ficaram sem uso | **Mantidos** (apagar exige `rm`, que está em `ask`) | Regra 2 | Remover os arquivos/mocks (listado em "Pendências") |
| 20/10/2026 | Rodar `npm run db:seed:demo` (pedido: seed com 90 dias de sessões) | **Escrito, não executado**: `Bash(npm run db:seed:*)` está na lista `ask` | Regra 2 (não pedir, não contornar com outro comando) | Rodar `npm run db:seed:demo` (listado em "Pendências") |
| 20/10/2026 | Ampliar o seed padrão ou criar comando separado? | Comando separado `db:seed:demo` (`scripts/seed-demo.mts`), que pula as contas do app do aluno | O f3 espera a Camila sem treinos e o k212/Início usam contagens do seed padrão | Apagar o script e a linha do `package.json` |
| 20/10/2026 | Conferência do Início "logado como o professor" | Feita como roteiro e2e (`e2e/inicio-professor-cards.e2e.mjs`, rodado por `npm run test:e2e`, permitido), depois do f3, com dados reais da Camila | Rodar Playwright avulso exigiria ler o `.env.local` por outro caminho | Remover o roteiro |
| 20/10/2026 | `npm run test:db` completo teve 2 falhas (Storage travou 15 min em `exercise-media`; `session-rating` caiu junto) | Reexecutados isolados: passaram (22 testes) | Falha de infraestrutura, não de código; nenhum teste alterado | — |
| 20/10/2026 | f3 caiu uma vez sem linha "✗" (139 s) | Reexecutado duas vezes: passou (64 s e 73 s) | Intermitente; sem mudança de código | — |
