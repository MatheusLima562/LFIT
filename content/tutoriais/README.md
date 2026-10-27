# Tutoriais do app

Tutoriais passo a passo para quem usa o app. Os do professor aparecem no painel em **Ajuda** (`/ajuda`).

## Pastas

| Pasta | Público | Onde aparece |
|---|---|---|
| `professor/` | personal trainer e administrador da conta | painel, menu **Ajuda** (`/ajuda/<slug>`) |
| `aluno/` | aluno (app) | ainda não exibido no app — reservado |

O nome do arquivo (sem `.md`) é o **slug** e vira a URL: `professor/01-tour-pela-interface.md` → `/ajuda/01-tour-pela-interface`.
Use minúsculas, números e hífens. O slug precisa ser único entre **todas** as pastas.

## Frontmatter (obrigatório)

```
---
title: Tour pela interface do professor
summary: Uma frase dizendo o que a pessoa vai aprender.
audience: professor
order: 1
updated: 2026-10-14
video_url: https://www.youtube.com/watch?v=XXXXXXXXXXX
---
```

- `title` e `summary`: texto simples, numa linha.
- `audience`: `professor` ou `aluno` — igual ao nome da pasta.
- `order`: número inteiro; define a ordem na lista.
- `updated`: data da última revisão, `AAAA-MM-DD`.
- `video_url` (opcional): vídeo do tutorial, mostrado no topo da página (o texto continua abaixo). Só **YouTube**
  (`youtube.com/watch?v=…`, `youtu.be/…`) ou **Loom** (`loom.com/share/…`); qualquer outro endereço é ignorado pela página
  e reprovado pelo teste. O player só carrega quando a pessoa clica. Sem `video_url`, nada muda.

O teste `tests/unit/tutorials.test.ts` valida tudo isso em todos os arquivos (e falha com slug repetido ou link quebrado).

## Público e tom

- Leitor: personal trainer **sem perfil técnico**. Português do Brasil, frases curtas, "você".
- Use os nomes exatos dos botões e menus, em **negrito** (ex.: **Adicionar aluno**).
- Para o nome do app, escreva `{{marca}}` (nunca o nome em si): ele vem de `features/brand/config.ts`, e trocar o nome
  não exige editar tutoriais.
- Passo a passo numerado (`1.`), um passo por linha.
- Documente **só o que existe e funciona hoje**. Nada de "em breve", módulos marcados "Em breve" ou recursos planejados.
- Exemplos com nomes **fictícios** (ex.: "Marina Teixeira (fictícia)"). **Nunca** dados reais de alunos nem dados de saúde.
- Sem capturas de tela por enquanto.

## Markdown suportado

O app renderiza um Markdown simples (sem dependência externa):

- `## Seção` e `### Subseção` (o título principal vem do `title`; não use `#`).
- Parágrafos, listas `1.` e `-` (um item por linha, sem sub-listas).
- `> texto` vira uma dica em destaque.
- `**negrito**`, `` `código` ``.
- Links só internos: `[Meus alunos](/alunos)` ou `[seção](#nome-da-secao)`. Link externo é proibido (o teste falha) e
  todo link interno precisa apontar para uma tela disponível (nada de link morto).

Qualquer outra marcação aparece como texto puro.

## Como criar um tutorial novo

1. Crie `content/tutoriais/<público>/<NN-slug>.md` (o `NN` ajuda a manter a ordem no editor).
2. Preencha o frontmatter acima.
3. Escreva seguindo "Público e tom".
4. Rode `npm test` (valida frontmatter, slug e links) e abra `/ajuda/<slug>` no `npm run dev`.

## Regra de atualização

**Ao alterar uma tela do professor, atualize o tutorial correspondente em `content/tutoriais/` e o campo `updated`, e
regrave o vídeo afetado** (tabela em [Vídeos](#vídeos)).
Se a mudança tornar um passo errado (botão renomeado, tela movida), corrija o passo no mesmo commit da mudança.

## Vídeos

Os vídeos são **gerados por script** a partir de roteiros (para regravar quando a tela mudar), sempre no **lfit-dev** e
só com os usuários **fictícios** do seed. Nunca grave com dados reais.

| Vídeo (roteiro) | Cobre (seções deste tutorial) |
|---|---|
| `e2e/tutoriais/01-visao-geral.roteiro.mjs` | `professor/01-tour-pela-interface.md`: Como entrar, O menu lateral, Início |
| `e2e/tutoriais/02-cadastrar-aluno.roteiro.mjs` | `professor/01-tour-pela-interface.md`: Cadastrar um aluno |
| `e2e/tutoriais/03-montar-e-ativar-treino.roteiro.mjs` | `professor/01-tour-pela-interface.md`: Montar e ativar um treino |

Cada roteiro é uma lista de passos `{ legenda, acao }`. A legenda é o texto do tutorial em frase curta (até 2 linhas
de 42 caracteres; o teste `tests/unit/tutoriais-video.test.ts` confere). A ação usa o "estúdio"
(`e2e/tutoriais/_estudio.mjs`): `irPara`, `clicar`, `digitar` (devagar), `apontar` (só destaca), `tecla`, `esperar`.
O roteiro também pode ter `preparar`/`limpar` (apagam o que ele cria; a gravação é idempotente).

### Como gravar

1. `.env.local` do lfit-dev com `ALLOW_DB_TESTS=true` e `SEED_USER_PASSWORD` (a mesma trava dos roteiros e2e).
2. Seed aplicado (`npm run db:seed`). O roteiro 03 usa o aluno fictício João Gonçalves **sem treino**; se ele já tiver
   treino, o script avisa (refaça o seed com `npm run db:seed -- --reset`, só no lfit-dev).
3. `npm run build`. O script usa o servidor que estiver na porta 3100 ou sobe o `next start` sozinho, com as chaves de
   teste do Turnstile.
4. Grave:

```bash
npm run tutoriais:video -- 01-visao-geral        # um roteiro (o prefixo basta: 01)
npm run tutoriais:video -- 01 02 03              # vários
npm run tutoriais:video -- todos
npm run tutoriais:video -- 02 --legenda-na-tela  # também escreve a legenda dentro do vídeo
```

Saída em `tutoriais-video/` (fora do git; **nada de binário no repositório**): `NN-nome.webm` (1280×720, VP9, sem
áudio) e `NN-nome.srt` (legendas sincronizadas pelo tempo real de cada passo). Se um passo falhar, o script para, diz
qual foi e salva a tela em `tutoriais-video/NN-nome-erro.png`.

Como funciona: cursor visível (círculo que pulsa no clique), destaque amarelo no elemento antes do clique e pausas de 1 a
2 s entre as ações. A gravação usa o próprio Chrome (quadros da tela via CDP + `MediaRecorder`), sem ffmpeg e sem
instalar nada.

### Como regravar

Mudou uma tela que aparece num vídeo? Ajuste o roteiro (seletores e legendas) e rode o comando de novo: os arquivos
em `tutoriais-video/` são substituídos. Depois suba a versão nova no mesmo lugar e, se o endereço mudar, atualize o
`video_url` do tutorial. Se um passo não funcionar com o seed, ajuste o **roteiro**, nunca o código do sistema.

### Onde hospedar

- **YouTube** (vídeo "Não listado"): envie o `.webm` e, em Legendas, o `.srt` como "Português (Brasil)". Grave sem
  `--legenda-na-tela` (senão a legenda aparece duas vezes).
- **Loom**: o Loom não usa o nosso `.srt`. Grave com `--legenda-na-tela` para a legenda ficar no vídeo.

Depois copie o link para o `video_url` do tutorial (um vídeo por tutorial; o player aparece no topo da página).
