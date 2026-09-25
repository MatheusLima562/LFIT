# Etapa 2.10 — Fase B (app): regras aprovadas, Guia e sinais de alerta

> Plano para aprovação do dono. Base: documentos revisados em `docs/conhecimento/` e
> `docs/revisao/contraindicacoes-v2.csv` (19 linhas "S"). Nada é implementado antes da aprovação.

## B1 — Migration de dados clínicos (1 commit)

`supabase/migrations/2026100812xxxx_knowledge_base_rules.sql`

1. **`health_conditions` ganha 2 colunas** (globais e da org):
   - `parent_id` (autorreferência, opcional): liga a condição à região ("Hérnia discal lombar…" → "Coluna lombar").
     Uma condição global só pode ter uma condição global como pai; uma condição da org pode ter uma global ou uma da
     própria org. Vale um nível só: o pai não pode ter pai.
   - `search_terms text[]`: sinônimos de busca ("condromalácia", "osteoartrite", "gonartrose", "impacto").
     Entram na busca de `/treinos/condicoes` e do diálogo de grupos especiais, sem acento.
2. **8 condições globais novas** (a chave `key` é estável e é ela que liga a condição ao Guia):

   | key | Nome | Região (pai) |
   |---|---|---|
   | `hernia_lombar_flexao` | Hérnia discal lombar (intolerância à flexão) | Coluna lombar |
   | `dor_lombar_flexao` | Dor lombar — intolerância à flexão | Coluna lombar |
   | `estenose_lombar_extensao` | Estenose lombar (intolerância à extensão) | Coluna lombar |
   | `espondilolistese_extensao` | Espondilolistese (intolerância à extensão) | Coluna lombar |
   | `dor_lombar_extensao` | Dor lombar — intolerância à extensão | Coluna lombar |
   | `ombro_manguito` | Dor no ombro relacionada ao manguito rotador | Ombro |
   | `joelho_patelofemoral` | Dor patelofemoral | Joelho |
   | `joelho_artrose` | Artrose de joelho | Joelho |

   Para a lombalgia inespecífica e a cervicalgia **não** crio condição nova: os Guias delas ficam nas regiões
   existentes "Coluna lombar" (`lombar`) e "Coluna cervical" (`cervical`), que continuam sem regras.
   - **Conflito de nome:** se alguma organização já tiver uma condição própria com um desses nomes, a migration não
     falha. Ela avisa (`raise notice`) e mantém a condição da organização. Hoje o sistema recusa uma condição da org
     com o mesmo nome de uma global, mas não o contrário.
3. **2 exercícios globais novos**, com padrões na camada global (`exercise_defaults`: 3 × 12–15, pausa 45–60 s):
   - "Rotação externa com elástico/polia" (grupo: ombros; equipamento: elástico ou polia).
   - "Elevação no plano da escápula" (grupo: ombros; equipamento: halteres).
   - Instruções curtas, no estilo das atuais.
4. **As 19 regras "S" do CSV v2**, todas `caution`, com a nota = "como adaptar" (≤ 300 caracteres). O exercício e a
   condição são buscados pelo nome no escopo global. A migration confere que foram inseridas exatamente 19 regras e,
   se não, interrompe (`raise exception`). As linhas "N" não entram.
5. `npm run db:types`. Aplicação só no **lfit-dev**: listar antes as migrations pendentes (`supabase migration list`),
   depois `db push`.
6. **Seed:** vincular um grupo especial fictício a "Hérnia discal lombar (intolerância à flexão)", para ver alertas
   reais no montador.
7. **Testes** (`tests/db/knowledge-base.test.ts`):
   - As 19 regras existem e nenhuma é `avoid`.
   - A org não consegue alterar condição nem regra global.
   - Um aluno num grupo ligado à hérnia gera alerta no nível completo.
   - O nível restrito continua sem condição, nota ou grupo.
   - O papel `student` não lê nada disso.

## B2 — Guia no montador (1 commit)

- **Conteúdo** em `features/knowledge/guides/<key>.ts`, dados estruturados em TypeScript e sem dependência nova. As
  seções vêm do documento aprovado:
  - Resumo prático;
  - tabelas "adaptar" e "fase mais sensível";
  - sinais de alerta (emergência 192 / mesmo dia / encaminhar);
  - orientação ao aluno;
  - referências com link.

  Os `.md` continuam sendo a fonte, e um teste unitário garante que cada Guia aponta para uma condição global que
  existe. São 10 Guias: `lombar`, `cervical` e as 8 condições novas.
- **Onde aparece:** no montador, um painel "Condições do aluno" lista as condições que vêm dos grupos especiais,
  cada uma com o botão **"Guia"**, que abre uma aba lateral (Sheet). Os dados vêm dos grupos do aluno → condições,
  pelo RLS que já existe (`student_groups` já depende do acesso à saúde).
  - **Visível só no nível completo** (`can_view_student_health`). Nos níveis restrito e oculto, o painel não é
    renderizado e nenhum dado vai para o cliente.
  - Condição da organização sem Guia próprio mostra o Guia da região pai, quando houver.
- **Aviso fixo** no topo de todo Guia: "Conteúdo de apoio à decisão profissional; não substitui avaliação médica ou
  fisioterapêutica."
- O Guia nunca aparece na impressão, no app do aluno nem em logs.

## B3 — Checklist de sinais de alerta (1 commit + migration)

Hoje a anamnese só registra a *solicitação*: as respostas chegam na Fase 3. Por isso proponho uma **triagem feita
pelo professor**:

- **Tabela `student_red_flag_checks`:** organização, aluno, `items text[]` (chaves dos sinais marcados),
  `none_present bool`, `referred bool`, `checked_by`, `checked_at`. É dado de saúde: leitura e escrita só com
  `can_view_student_health`, e cada registro vai para o `audit_logs`.
- **Escrita** pela RPC `record_red_flag_check`, `SECURITY DEFINER`, seguindo o checklist do CLAUDE.md
  (`lock_accessible_student` + `can_view_student_health`; testes com o papel `student` e anônimo). Chaves fora da
  lista são recusadas; a lista também existe em SQL, e um teste confere que as duas estão iguais.
- **Itens** (fixos, agrupados pela conduta), só os que estão nos documentos aprovados:
  - **Emergência — SAMU 192:**
    - dor no peito, ou dor no ombro/braço com esforço acompanhada de falta de ar ou sudorese;
    - cefaleia súbita e intensa, tontura, fala enrolada, visão dupla, dificuldade para engolir, desequilíbrio;
    - falta de ar súbita.
  - **Mesmo dia:**
    - alteração de bexiga/intestino ou dormência na "sela";
    - panturrilha/perna inchada e dolorida;
    - articulação quente e inchada, com ou sem febre.
  - **Encaminhar antes de treinar:**
    - fraqueza ou dormência progressiva (braço/perna);
    - sintomas nos dois lados;
    - trauma recente;
    - luxação;
    - história de câncer, perda de peso sem explicação ou dor noturna que impede dormir;
    - piora rápida.
- **Onde aparece:** bloco "Triagem de sinais de alerta" no modal do aluno (Editar → seção de saúde), com "Nenhum
  destes" ou os itens marcados, mais "Encaminhado". O montador mostra um aviso (só no nível completo) quando a última
  triagem tem sinal marcado. O aviso **não bloqueia** o salvar, como os alertas.
- Os mesmos itens viram depois perguntas do modelo de anamnese da Fase 3.

## B4 — Fechamento (1 commit)

- CLAUDE.md: regras aprovadas, `parent_id`/`search_terms`, Guia, triagem e a tabela de funções `SECURITY DEFINER`.
- PROXIMOS_PASSOS.
- Verificação: `tsc`, lint, build, `npm test` (incluindo os testes de banco) e advisors. Roteiro de navegador com
  owner, professor responsável e professor do plano, conferindo que o Guia e a triagem não aparecem nos níveis
  restrito e oculto.

Parar ao final da Fase B para o seu teste. Depois, a 2.11.

## Decisões para o dono
1. **Triagem:** feita pelo professor agora (B3, recomendado) ou só como perguntas da anamnese na Fase 3?
2. **Guia também no catálogo `/treinos/condicoes`** para qualquer staff? É conteúdo geral, não dado de aluno.
   Recomendo que sim, e no montador só no nível completo.
3. **Lombalgia inespecífica e cervicalgia** como Guias das regiões "Coluna lombar"/"Coluna cervical", sem condição
   nova?
4. **Padrões dos 2 exercícios novos:** 3 × 12–15, pausa 45–60 s?
