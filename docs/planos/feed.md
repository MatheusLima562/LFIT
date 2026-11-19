# Feed (Comunidade): recado do professor e fase 2

Status: **só plano, nada implementado.** A fase 1 já está no código (migration `20261119160000_feed.sql`, seção
"Feed (Comunidade)" do CLAUDE.md).

## 1. O "Recado do professor" vira um post fixado?

### Como funciona hoje (`trainer_announcements`, etapa 2.12/3.3)
- O recado vai para um aluno ou para todos os alunos de quem publica.
- Vale por 7 dias (`expires_at`) e só o autor encerra.
- Aparece na tela **Hoje**, com marcador na aba e o aviso "Novo recado do seu professor".
- Um recado novo substitui o anterior na tela do aluno.

### Comparação com o post fixado do feed
| Ponto | Recado | Post fixado |
|---|---|---|
| Público | um aluno **ou** todos | todos, modalidade ou turma (nunca um aluno só) |
| Validade | expira (7 dias) | fica até desafixar ou apagar |
| Onde aparece | Hoje (contexto do treino) | Comunidade |
| Quantos | 1 por vez | vários fixados |
| Curtida | não tem | tem |

### Proposta (recomendada): unificar só o recado "para todos"
1. **Recado para todos** passa a ser um post do feed com `pinned = true` e uma data de fim nova (`unpin_at`): na data, o
   post sai do topo sozinho, sem ser apagado.
   - A tela Hoje passa a mostrar o post fixado mais recente, com "Ver na Comunidade".
   - Assim o personal não mantém duas ferramentas para a mesma mensagem.
2. **Recado para um aluno** continua em `trainer_announcements`. O feed é coletivo e não deve ganhar público
   "um aluno só", porque isso se confunde com o chat e cria risco de expor um aluno aos outros.
3. **Migração:**
   - Os recados "para todos" ativos viram posts fixados com `unpin_at = expires_at`.
   - O botão "Recado para todos" do `/chat` passa a abrir o editor do feed já com "Fixar no topo" marcado.
   - `set_trainer_announcement` com `p_student_id` nulo fica recusado.
   - **Nada é removido** antes de o dono aprovar e testar.
4. **Risco:** o aviso de recado novo (N1) depende de `get_my_announcement`. Ele precisaria também olhar o post fixado
   mais novo. É um teste a mais no `n1-notificacoes`.

Decisão do dono pendente. Até lá, as duas coisas convivem: o recado na Hoje e o feed na Comunidade.

## 2. Fase 2: comentários com moderação, denúncia e nome de exibição

### Princípios
- O aluno passa a escrever, e texto livre de aluno pode conter dado de saúde ("voltei da fisioterapia").
- Por isso, **todo comentário nasce pendente** e só fica visível aos outros alunos depois que o personal aprova.
- O autor vê o próprio comentário com a etiqueta "aguardando aprovação".

### Banco (migration nova)
- **`feed_comments`:**
  - Colunas: `id`, `organization_id`, `post_id`, `student_id`, `body` (≤ 500, texto puro, mesmo CHECK de HTML),
    `status` (`pending` | `approved` | `rejected`), `moderated_by`, `moderated_at`, `created_at`, `deleted_at`.
  - Escrita só por RPC: `add_feed_comment`, `moderate_feed_comment`, `delete_my_feed_comment`.
  - Limite de 10 comentários por hora por aluno.
- **`feed_reports`:**
  - Colunas: `id`, `organization_id`, `comment_id` ou `post_id`, `reporter_student_id`, `reason` (lista fixa: ofensivo,
    dado pessoal ou de saúde, spam, outro), `created_at`, `resolved_at/by`.
  - Unique por (denunciante, alvo).
  - Comentário com 2 denúncias volta a `pending` sozinho, até o personal decidir.
- **`students.display_name`:**
  - Opcional, até 30 caracteres, escolhido pelo aluno.
  - Sem nome de exibição, aparece "Aluno(a)", nunca o nome do cadastro. O nome real nunca aparece para outro aluno.
  - Validação de palavras proibidas e unicidade por organização.
- **Comentários nas RPCs:**
  - `get_my_feed` devolve os comentários aprovados: só o nome de exibição, nunca `student_id`.
  - `list_feed_posts` devolve também os pendentes, para moderar.

### Telas
- **Personal:**
  - Fila "Para moderar" na página Feed: aprovar, rejeitar ou apagar.
  - Denúncias com o motivo, sem o nome de quem denunciou.
  - Desligar comentários por post.
- **Aluno:**
  - Campo de comentário com o aviso "Não escreva dados de saúde; seu comentário aparece para outros alunos depois de
    aprovado".
  - "Denunciar" em cada comentário.
  - Escolha do nome de exibição no Perfil.

### Fora do escopo (fase 3, se houver)
- Push de comentário novo.
- Menções.
- Aluno publicar post.
- Upload de vídeo, que continua só por link por causa do custo de armazenamento e banda.

### Pendências legais
- **Termos de uso da comunidade:** regras de conduta, remoção de conteúdo, base legal para exibir o nome de exibição.
- **`/privacidade`:** precisa citar o feed, as curtidas (só contagem) e os comentários. É revisão do advogado, como as
  demais páginas legais.
