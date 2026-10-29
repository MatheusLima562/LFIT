# Etapa 2.11 — ampliação da biblioteca global (proposta; NÃO aplicada)

_Rascunho de 29/10/2026 (sprint autônoma). Nada foi para o banco: a biblioteca global só muda por migration, e o
padrão do projeto é publicar conteúdo global depois da sua revisão (como as contraindicações)._

## O que está pronto para você revisar

- `docs/revisao/biblioteca-2.11.csv` — **41 exercícios** novos (hoje são 54), escolhidos para cobrir variações comuns de
  academia que faltam na biblioteca (máquinas, polia, Smith, cardio). Colunas: `aprovar` (marque `sim`), nome, grupos
  musculares (mesmos códigos de `private.valid_muscle_groups`), equipamento, instruções curtas e padrão sugerido
  (séries × quantidade · pausa).
- Nenhum nome repete um global existente (conferido; "Elevação pélvica com barra" saiu por já existir como "Elevação
  pélvica").

## O que fica de fora de propósito

- **Contraindicações:** nenhuma regra nova. Exercício novo entra sem regra, como a biblioteca inicial; regras seguem o
  fluxo próprio (CSV de revisão → só as aprovadas, migration separada).
- **Vídeos:** sem link de terceiros na biblioteca global (o professor adiciona o próprio).
- **Guias da base de conhecimento:** inalterados.

## Depois da sua aprovação

1. Migration `…_library_2_11.sql` com só as linhas `aprovar = sim` (`insert into public.exercises … created_by null`) +
   `exercise_defaults` globais do padrão sugerido.
2. Teste de banco: aluno/anônimo não escrevem; exercícios novos visíveis para qualquer organização; busca sem acento.
3. Tutorial da biblioteca: só se a tela mudar (não deve).
