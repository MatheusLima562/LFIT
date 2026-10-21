/**
 * Vídeo 01 — Visão geral: entrar, menu lateral e Início.
 * Roteiro derivado de content/tutoriais/professor/01-tour-pela-interface.md ("Como entrar", "O menu lateral", "Início").
 * Usuário fictício do seed (Rafael Exemplo, administrador). Não cria nem altera dados.
 */
import { BRAND } from "../../features/brand/config.ts";

const menu = (v) => v.page.getByRole("navigation", { name: "Menu principal" });
const regiao = (v, nome) => v.page.getByRole("region", { name: nome });

const roteiro = {
  titulo: "Visão geral: entrar, menu lateral e Início",
  usuario: "owner.seed@example.com",
  loginNoVideo: true,
  passos: [
    {
      legenda: "Para entrar no painel, digite o seu e-mail.",
      acao: (v) => v.digitar(v.page.getByLabel("E-mail"), "owner.seed@example.com", { atraso: 55 }),
    },
    {
      legenda: "Depois, digite a sua senha.",
      acao: (v) => v.digitar(v.page.getByLabel("Senha", { exact: true }), process.env.SEED_USER_PASSWORD, { atraso: 55 }),
    },
    {
      legenda: "Clique em Entrar.",
      acao: async (v) => {
        await v.clicar(v.page.getByRole("button", { name: "Entrar" }), { depois: 0 });
        await v.page.waitForURL(/\/$/, { timeout: 30000 });
        await v.esperar(800);
      },
    },
    {
      legenda: "Esta é a tela Início, o resumo do seu dia.",
      acao: (v) => v.apontar(v.page.getByRole("heading", { level: 1 })),
    },
    {
      legenda: "O menu lateral fica à esquerda.",
      acao: (v) => v.apontar(v.page.getByRole("link", { name: `${BRAND.name} — Início` })),
    },
    {
      legenda: "Em Alunos: todos os alunos, cadastros públicos e grupos especiais.",
      acao: async (v) => {
        await v.clicar(menu(v).getByRole("button", { name: "Alunos" }));
        await v.apontar(menu(v).getByRole("link", { name: "Todos os alunos" }), 900);
        await v.apontar(menu(v).getByRole("link", { name: "Grupos especiais" }), 900);
      },
    },
    {
      legenda: "Em Turmas, os alunos que treinam juntos.",
      acao: (v) => v.apontar(menu(v).getByRole("link", { name: "Turmas" })),
    },
    {
      legenda: "Em Treinos & Exercícios: treinos, exercícios e modelos prontos.",
      acao: async (v) => {
        await v.clicar(menu(v).getByRole("button", { name: "Treinos & Exercícios" }));
        await v.apontar(menu(v).getByRole("link", { name: "Treinos", exact: true }), 900);
        await v.apontar(menu(v).getByRole("link", { name: "Modelos prontos" }), 900);
      },
    },
    {
      legenda: "Itens com a etiqueta Em breve ainda não estão disponíveis.",
      acao: (v) => v.apontar(menu(v).getByRole("listitem").filter({ hasText: /^Avaliação/ })),
    },
    {
      legenda: "No Chat ficam as conversas com os seus alunos.",
      acao: (v) => v.apontar(menu(v).getByRole("link", { name: "Chat" })),
    },
    {
      legenda: "Em Ajuda estão os tutoriais.",
      acao: (v) => v.apontar(menu(v).getByRole("link", { name: "Ajuda" })),
    },
    {
      legenda: "No rodapé do menu: o seu plano e quantas vagas de aluno estão em uso.",
      acao: (v) => v.apontar(v.page.getByRole("progressbar", { name: "Alunos usados no plano" })),
    },
    {
      legenda: "Clique no seu nome para sair da conta.",
      acao: async (v) => {
        await v.clicar(v.page.getByRole("button", { name: "Menu da conta" }), { depois: 400 });
        await v.apontar(v.page.getByRole("menuitem", { name: "Sair" }), 1200);
        await v.tecla("Escape");
      },
    },
    {
      legenda: "Em Buscar aluno, digite um nome e tecle Enter.",
      acao: (v) => v.apontar(v.page.getByRole("searchbox", { name: "Buscar aluno" })),
    },
    {
      legenda: "O botão Novo é um atalho para cadastrar um aluno.",
      acao: (v) => v.apontar(v.page.getByRole("button", { name: "Novo" })),
    },
    {
      legenda: "Alunos ativos: quantos alunos ocupam vaga no seu plano.",
      acao: (v) => v.apontar(regiao(v, "Visão geral")),
    },
    {
      legenda: "Acompanhamento: treinos a vencer, vencidos e alunos sem treino.",
      acao: async (v) => {
        await v.clicar(regiao(v, "Acompanhamento de alunos").getByRole("tab", { name: /Vencidos/ }));
        await v.clicar(regiao(v, "Acompanhamento de alunos").getByRole("tab", { name: /Sem treino/ }));
      },
    },
    {
      legenda: "Plano: vagas usadas e disponíveis.",
      acao: (v) => v.apontar(regiao(v, "Plano")),
    },
    {
      legenda: "Novos alunos: cadastrados hoje, em 7 dias e em 30 dias.",
      acao: (v) => v.apontar(regiao(v, "Novos alunos")),
    },
    {
      legenda: "Acesso expirando: alunos cujo acesso ao app vence nos próximos dias.",
      acao: (v) => v.apontar(regiao(v, "Acesso expirando")),
    },
    {
      legenda: "Em Personalizar, você escolhe quais cards aparecem.",
      acao: (v) => v.apontar(v.page.getByRole("button", { name: "Personalizar" })),
    },
  ],
};

export default roteiro;
