# Tutoriais do LFit

Tutoriais passo a passo para quem usa o LFit. Os do professor aparecem no painel em **Ajuda** (`/ajuda`).

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
---
```

- `title` e `summary`: texto simples, numa linha.
- `audience`: `professor` ou `aluno` — igual ao nome da pasta.
- `order`: número inteiro; define a ordem na lista.
- `updated`: data da última revisão, `AAAA-MM-DD`.

O teste `tests/unit/tutorials.test.ts` valida tudo isso em todos os arquivos (e falha com slug repetido ou link quebrado).

## Público e tom

- Leitor: personal trainer **sem perfil técnico**. Português do Brasil, frases curtas, "você".
- Use os nomes exatos dos botões e menus, em **negrito** (ex.: **Adicionar aluno**).
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

**Ao alterar uma tela do professor, atualize o tutorial correspondente em `content/tutoriais/` e o campo `updated`.**
Se a mudança tornar um passo errado (botão renomeado, tela movida), corrija o passo no mesmo commit da mudança.
