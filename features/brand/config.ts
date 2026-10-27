/**
 * MARCA — fonte única. Nome do app (provisório: "LFit"), textos de marca, logo e cores usados por telas, metadados,
 * manifest do PWA, ícones, exportações, textos da interface (messages/pt-BR.ts) e tutoriais (placeholder `{{marca}}`).
 * Trocar o nome = editar `name` aqui. Nada de marca escrito à mão em outro lugar (o teste
 * tests/unit/brand.test.ts procura o nome fora deste arquivo).
 *
 * Cores: `colors` alimenta o que não passa pelo CSS (manifest, ícones do PWA, cor da barra do navegador, painel do
 * login). A paleta da interface (tons claros/escuros, foco, botão primário) fica nos tokens `--brand-*` de
 * app/globals.css, porque cada tom tem contraste AA validado por tema; o teste de marca exige que `colors.primary` seja
 * o mesmo `--color-brand-500` do CSS. Trocar a cor = editar aqui e os tokens, rodando tests/unit/color-tokens.test.ts.
 *
 * Arquivo puro (sem import do Next): roda também em scripts/roteiros .mjs.
 */
export const BRAND = {
  /** Nome do produto (provisório). */
  name: "LFit",
  /** Frase curta do produto (rodapé do login, título padrão). */
  tagline: "Gestão para personal trainers",
  /** Selo ao lado do nome no painel. */
  staffBadge: "Personal",
  /** Nome e descrição do app do aluno (PWA). */
  studentApp: { name: "Meu treino", description: "Seu treino, série a série." },
  /** Painel de marca da tela de login (desktop). */
  pitch: {
    title: "Tudo do seu trabalho como personal, em um só lugar.",
    items: ["Alunos, treinos e avaliações organizados", "Acompanhamento de frequência e feedbacks", "Dados de saúde protegidos (LGPD)"],
  },
  /** Logo: traços do "L" num quadro 24×24 (SVG, `stroke`). */
  logoPaths: ["M7 4v13h10", "M13 10h4"],
  colors: {
    /** Cor da marca (= --color-brand-500 em app/globals.css). */
    primary: "#f0642d",
    /** Tons do degradê do logo/ícones e do painel do login. */
    primaryDark: "#c2461a",
    primaryDarker: "#9a320e",
    primaryLight: "#e2632c",
    /** Fundo do app (barra do navegador, splash do PWA), claro e escuro. */
    background: "#f7f7f5",
    backgroundDark: "#0f0f0e",
  },
} as const;

/** "LFit — Meu treino" */
export const studentAppTitle = `${BRAND.name} — ${BRAND.studentApp.name}`;
/** "LFit — Gestão para personal trainers" */
export const productTitle = `${BRAND.name} — ${BRAND.tagline}`;

/** Troca o placeholder `{{marca}}` (tutoriais e outros textos em arquivo) pelo nome do app. */
export function withBrand(text: string): string {
  return text.replaceAll("{{marca}}", BRAND.name);
}
