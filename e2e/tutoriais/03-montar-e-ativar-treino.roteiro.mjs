/**
 * Vídeo 03 — Montar e ativar um treino. Roteiro derivado de content/tutoriais/professor/01-tour-pela-interface.md
 * ("Montar e ativar um treino"). Usuário fictício do seed (Rafael Exemplo); aluno fictício João Gonçalves (seed: sem
 * treino e sem grupos especiais, então o montador não mostra alertas). O treino criado é apagado antes e depois.
 */
const ALUNO = "João Gonçalves";
const TREINO = "Hipertrofia iniciante";

async function aluno({ admin, org }) {
  const { data, error } = await admin.from("students").select("id").eq("organization_id", org.id).eq("first_name", "João").eq("last_name", "Gonçalves").is("deleted_at", null).single();
  if (error || !data) throw new Error(`aluno fictício "${ALUNO}" não encontrado: rode npm run db:seed`);
  return data.id;
}

async function apagarTreino(ctx) {
  const { error } = await ctx.admin.from("training_plans").delete().eq("organization_id", ctx.org.id).eq("student_id", await aluno(ctx)).eq("name", TREINO);
  if (error) throw new Error(`não consegui apagar o treino de exemplo: ${error.message}`);
}

/** Data de hoje + n dias em São Paulo, só os dígitos (o campo aplica a máscara dd/mm/aaaa). */
function data(dias) {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + dias * 86_400_000));
  const [a, m, d] = iso.split("-");
  return `${d}${m}${a}`;
}

const painel = (v) => v.page.getByRole("dialog");

async function adicionarExercicio(v, busca, nome) {
  await v.clicar(v.page.getByRole("button", { name: "Adicionar exercício" }), { depois: 600 });
  await v.digitar(painel(v).getByLabel("Buscar exercício"), busca);
  await v.clicar(painel(v).getByRole("button", { name: new RegExp(`^${nome}`) }).first(), { depois: 800 });
}

const roteiro = {
  titulo: "Montar e ativar um treino",
  usuario: "owner.seed@example.com",
  inicio: "/alunos",
  async preparar(ctx) {
    const { count } = await ctx.admin.from("training_plans").select("id", { count: "exact", head: true }).eq("student_id", await aluno(ctx)).neq("status", "archived");
    if (count) throw new Error(`${ALUNO} já tem treino atual no seed: rode npm run db:seed -- --reset (só no lfit-dev)`);
  },
  limpar: apagarTreino,
  passos: [
    {
      legenda: "Em Meus alunos, encontre o aluno.",
      acao: async (v) => {
        await v.digitar(v.page.getByRole("searchbox", { name: "Buscar alunos" }), "João");
        await v.page.waitForURL(/[?&]q=Jo/, { timeout: 10000 });
        await v.page.getByRole("row").filter({ hasText: ALUNO }).waitFor();
      },
    },
    {
      legenda: "Abra o menu ⋯ do aluno e clique em Treinos.",
      acao: async (v) => {
        await v.clicar(v.page.getByRole("button", { name: `Ações para ${ALUNO}` }), { depois: 500 });
        await v.clicar(v.page.getByRole("menuitem", { name: "Treinos" }), { depois: 0 });
        await v.page.getByRole("heading", { name: `Treinos · ${ALUNO}` }).waitFor();
      },
    },
    {
      legenda: "Clique em Novo treino.",
      acao: async (v) => {
        await v.clicar(v.page.getByRole("link", { name: "Novo treino" }), { depois: 0 });
        await v.page.getByRole("heading", { name: "Novo treino" }).waitFor();
        await v.esperar(600);
      },
    },
    {
      legenda: "Em Dados do treino, dê um nome ao treino.",
      acao: (v) => v.digitar(v.page.getByLabel("Nome do treino"), TREINO),
    },
    {
      legenda: "Preencha o Início e o Fim do treino.",
      acao: async (v) => {
        await v.digitar(v.page.getByRole("textbox", { name: "Início" }), data(0));
        await v.digitar(v.page.getByRole("textbox", { name: "Fim" }), data(60));
      },
    },
    {
      legenda: "Sem prazo? Ligue Sem data de expiração. Aqui vamos manter o Fim.",
      acao: (v) => v.apontar(v.page.getByRole("switch", { name: "Sem data de expiração" })),
    },
    {
      legenda: "A divisão A já vem criada. Clique em Adicionar exercício e busque pelo nome.",
      acao: (v) => adicionarExercicio(v, "agachamento", "Agachamento goblet"),
    },
    {
      legenda: "Ajuste séries, repetições, carga e pausa do exercício.",
      acao: async (v) => {
        const item = v.page.locator("[role=tabpanel] li", { hasText: "Agachamento goblet" }).first();
        await v.digitar(item.getByLabel("Séries", { exact: true }), "4");
        await v.apontar(item.getByLabel("Carga").first(), 1000);
      },
    },
    {
      legenda: "O botão Rápido adiciona com os valores padrão e mantém a busca aberta.",
      acao: async (v) => {
        await v.clicar(v.page.getByRole("button", { name: "Adicionar exercício" }), { depois: 600 });
        await v.digitar(painel(v).getByLabel("Buscar exercício"), "prancha");
        await v.clicar(painel(v).getByRole("button", { name: /Adicionar Prancha frontal rápido/ }), { depois: 1200 });
        await v.tecla("Escape");
      },
    },
    {
      legenda: "Use Adicionar divisão para criar a divisão B.",
      acao: (v) => v.clicar(v.page.getByRole("button", { name: "Adicionar divisão" })),
    },
    {
      legenda: "Adicione os exercícios da divisão B do mesmo jeito.",
      acao: (v) => adicionarExercicio(v, "supino", "Supino reto com halteres"),
    },
    {
      legenda: "Salvar rascunho guarda o treino sem liberar para o aluno.",
      acao: async (v) => {
        await v.clicar(v.page.getByRole("button", { name: "Salvar rascunho" }), { depois: 0 });
        await v.page.locator("[data-sonner-toast]").first().waitFor({ timeout: 15000 });
        await v.page.waitForURL(/\/treinos\/[0-9a-f-]+\/editar/, { timeout: 15000 });
        await v.esperar(800);
      },
    },
    {
      legenda: "Quando estiver pronto, clique em Ativar treino e confirme.",
      acao: async (v) => {
        await v.clicar(v.page.getByRole("button", { name: "Ativar treino" }), { depois: 600 });
        await v.clicar(v.page.getByRole("alertdialog").getByRole("button", { name: "Ativar treino" }), { depois: 0 });
        await v.page.getByRole("heading", { name: `Treinos · ${ALUNO}` }).waitFor({ timeout: 15000 });
        await v.esperar(600);
      },
    },
    {
      legenda: "Pronto! O treino está ativo e o aluno já vê no app.",
      acao: (v) => v.apontar(v.page.getByText(TREINO, { exact: true }).first(), 2000),
    },
    {
      legenda: "O treino ativo anterior, se houver, vai para Anteriores.",
      acao: (v) => v.apontar(v.page.getByRole("navigation", { name: "Treinos do aluno por período" }).getByRole("link", { name: /Anteriores/ })),
    },
  ],
};

export default roteiro;
