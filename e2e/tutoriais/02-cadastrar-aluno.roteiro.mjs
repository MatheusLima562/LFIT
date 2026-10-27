/**
 * Vídeo 02 — Cadastrar um aluno. Roteiro derivado de content/tutoriais/professor/01-tour-pela-interface.md
 * ("Cadastrar um aluno"). Usuário fictício do seed (Rafael Exemplo, administrador); aluna fictícia, e-mail @example.com.
 * O convite é desligado no vídeo (o e-mail não existe); a aluna é apagada antes e depois da gravação.
 */
const EMAIL = "marina.teixeira@example.com";

async function apagarAluna({ admin, org }) {
  const { error } = await admin.from("students").delete().eq("organization_id", org.id).ilike("email", EMAIL);
  if (error) throw new Error(`não consegui apagar a aluna de exemplo: ${error.message}`);
}

const dialogo = (v) => v.page.getByRole("dialog", { name: "Novo aluno" });

const roteiro = {
  titulo: "Cadastrar um aluno",
  usuario: "owner.seed@example.com",
  limpar: apagarAluna,
  passos: [
    {
      legenda: "No menu lateral, abra Alunos e clique em Todos os alunos.",
      acao: async (v) => {
        const menu = v.page.getByRole("navigation", { name: "Menu principal" });
        await v.clicar(menu.getByRole("button", { name: "Alunos" }));
        await v.clicar(menu.getByRole("link", { name: "Todos os alunos" }));
        await v.page.getByRole("heading", { name: "Meus alunos" }).waitFor();
      },
    },
    {
      legenda: "Clique em Adicionar aluno.",
      acao: async (v) => {
        await v.clicar(v.page.getByRole("link", { name: "Adicionar aluno" }).or(v.page.getByRole("button", { name: "Adicionar aluno" })).first());
        await dialogo(v).waitFor();
      },
    },
    {
      legenda: "Preencha Nome, Sobrenome e E-mail. São os campos obrigatórios.",
      acao: async (v) => {
        await v.digitar(dialogo(v).getByLabel("Nome *", { exact: true }), "Marina");
        await v.digitar(dialogo(v).getByLabel("Sobrenome *"), "Teixeira");
        await v.digitar(dialogo(v).getByLabel("E-mail *"), EMAIL, { atraso: 50 });
      },
    },
    {
      legenda: "Os outros campos são opcionais, como a data de nascimento.",
      acao: (v) => v.digitar(dialogo(v).getByLabel("Data de nascimento"), "15041995"),
    },
    {
      legenda: "Escolha o professor responsável pelo aluno.",
      acao: async (v) => {
        await v.clicar(dialogo(v).getByRole("combobox", { name: "Professor responsável" }), { depois: 500 });
        await v.clicar(v.page.getByRole("option", { name: "Rafael Exemplo" }));
      },
    },
    {
      legenda: "Enviar convite de acesso vem ligado: o aluno recebe um e-mail para criar a senha.",
      acao: (v) => v.apontar(dialogo(v).getByRole("switch", { name: "Enviar convite de acesso" }), 1800),
    },
    {
      legenda: "Neste exemplo o e-mail é fictício, então desligamos o convite.",
      acao: (v) => v.clicar(dialogo(v).getByRole("switch", { name: "Enviar convite de acesso" })),
    },
    {
      legenda: "Clique em Cadastrar aluno.",
      acao: async (v) => {
        await v.clicar(dialogo(v).getByRole("button", { name: "Cadastrar aluno" }), { depois: 0 });
        await dialogo(v).waitFor({ state: "detached", timeout: 30000 });
        await v.esperar(800);
      },
    },
    {
      legenda: "Pronto! Busque pelo nome para encontrar a aluna na lista.",
      acao: async (v) => {
        // Filtra antes de rolar a tabela: assim o vídeo não passa pelos grupos especiais (fictícios) de outros alunos.
        await v.digitar(v.page.getByRole("searchbox", { name: "Buscar alunos" }), "Marina");
        await v.page.waitForURL(/[?&]q=Marina/, { timeout: 10000 });
        await v.page.getByRole("table").getByRole("row").nth(1).filter({ hasText: "Marina Teixeira" }).waitFor();
        await v.apontar(v.page.getByRole("row").filter({ hasText: "Marina Teixeira" }), 1800);
      },
    },
    {
      legenda: "Convite não chegou? No menu ⋯ do aluno, use Copiar link de acesso.",
      acao: async (v) => {
        await v.clicar(v.page.getByRole("button", { name: "Ações para Marina Teixeira" }), { depois: 500 });
        await v.apontar(v.page.getByRole("menuitem", { name: "Copiar link de acesso" }), 1800);
        await v.tecla("Escape");
      },
    },
    {
      legenda: "O link vale por 30 minutos e só pode ser usado uma vez.",
      acao: (v) => v.esperar(600),
    },
  ],
};

export default roteiro;
