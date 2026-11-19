# Importação de treinos — PLANO (não implementado)

> Status: proposta para revisão do dono (19/11/2026). Nada disto existe no código. A importação de **alunos** já
> existe (`/importar`, ver CLAUDE.md "Importação genérica de alunos"); este plano cobre só os **treinos**.

## Objetivo
Trazer os treinos dos alunos de outra plataforma (MFIT primeiro) sem redigitar: cada linha da planilha vira um item
de um plano do aluno, ligado a um exercício da biblioteca (global ou da equipe).

## Entrada esperada
Uma linha por exercício prescrito: aluno (e-mail — a chave que liga ao aluno já importado), nome do treino, divisão
(A, B, C…), ordem, exercício (texto livre da outra plataforma), séries, repetições/quantidade, carga, pausa,
observação. Datas de início/fim do plano, se a plataforma exportar. O formato exato do MFIT só com um arquivo real.

## Mapeamento de nome de exercício → biblioteca
Ordem de tentativa, parando na primeira que der certo:
1. **Igual** ao nome de um exercício da biblioteca visível à organização (`exercise_library`, que já esconde o global
   quando a equipe tem cópia), comparando por `searchKey` (sem acento, minúsculas, espaços normalizados).
2. **Apelido salvo pela equipe**: tabela nova `exercise_aliases (organization_id, alias_key, exercise_id)`, preenchida
   quando a pessoa resolve um nome à mão (passo 4). Vale para as próximas importações da mesma origem.
3. **Sinônimos conhecidos** da biblioteca global (lista revisada pelo dono, como as contraindicações: "supino reto" =
   "supino com barra", "puxada frente" = "pulldown"…). Só entra por migration, depois de aprovada.
4. **Sugestão por semelhança** (trigrama, `pg_trgm`, já usado na busca): mostra as 3 mais parecidas, **nunca aplica
   sozinha** — a pessoa confirma na tela de revisão.

Cada nome distinto aparece uma vez na revisão ("Leg press 45" → escolher), não uma vez por linha.

## Sem correspondência
Opções por nome, escolhidas na revisão (padrão: a primeira):
- **Escolher um exercício existente** (com a sugestão do passo 4) e salvar como apelido.
- **Criar exercício da equipe** com aquele nome (sem vídeo, sem contraindicação), marcado "criado na importação" para
  revisão depois.
- **Pular** as linhas desse exercício (vão para o relatório de recusadas).

Nada é criado em silêncio: o relatório lista quantos nomes caíram em cada opção.

## Prescrição
`save_training_plan` já aceita o formato antigo na entrada (`private.read_prescription` converte "8–12", "20–30 s",
"até a falha", "8 por lado"); usar esse caminho. O que não converter vai para a dica do item, com aviso.

## Regras que precisam valer
- Planos importados entram como **rascunho** (nunca ativos sozinhos): o professor revisa alertas de contraindicação
  do aluno no montador e ativa.
- Sem dado de saúde na importação de treinos (nada de "observação de lesão" vira `care_note` automaticamente).
- Mesmo lote/declaração/desfazer da importação de alunos (`import_batches`), uma importação por vez por organização,
  defesa contra fórmula em toda planilha gerada, limite por célula, isolamento por organização.

## Decisões em aberto (do dono)
1. Criar exercício da equipe para nome sem correspondência é aceitável, ou só mapear para existentes?
2. Lista de sinônimos globais: quem revisa e quando.
3. Plano importado sem datas: "sem data de expiração" ou fim padrão (ex.: 8 semanas)?
4. Aluno com plano ativo no LFit: o importado fica só como rascunho (proposta) ou substitui?
