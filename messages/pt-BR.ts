/**
 * Textos da interface em PT-BR, centralizados para facilitar i18n no futuro.
 * Componentes novos devem buscar textos aqui em vez de escrevê-los inline.
 */
export const messages = {
  app: {
    name: "LFit",
    tagline: "Gestão para personal trainers",
    soon: "Em breve",
    soonHint: "Este módulo ainda está em construção.",
  },
  roles: {
    owner: "Administrador",
    trainer: "Professor",
    student: "Aluno",
  },
  theme: {
    label: "Tema",
    light: "Claro",
    dark: "Escuro",
    system: "Sistema",
  },
  userMenu: {
    label: "Menu da conta",
    signOut: "Sair",
    settings: "Configurações",
  },
  auth: {
    brandTitle: "Tudo do seu trabalho como personal, em um só lugar.",
    brandItems: [
      "Alunos, treinos e avaliações organizados",
      "Acompanhamento de frequência e feedbacks",
      "Dados de saúde protegidos (LGPD)",
    ],
    signIn: {
      title: "Entrar",
      subtitle: "Acesse o painel do treinador.",
      email: "E-mail",
      password: "Senha",
      submit: "Entrar",
      submitting: "Entrando…",
      forgot: "Esqueci minha senha",
      noAccount: "Professores entram por convite do administrador da conta.",
    },
    forgot: {
      title: "Recuperar senha",
      subtitle: "Enviaremos um link para você definir uma nova senha.",
      submit: "Enviar link",
      submitting: "Enviando…",
      sent: "Se existir uma conta com esse e-mail, você receberá um link em instantes. Confira também o spam.",
      back: "Voltar para o login",
    },
    newPassword: {
      resetTitle: "Definir nova senha",
      resetSubtitle: "Escolha uma senha com pelo menos 8 caracteres.",
      inviteTitle: "Boas-vindas ao LFit",
      inviteSubtitle: "Defina uma senha para acessar sua conta.",
      password: "Nova senha",
      confirm: "Confirmar senha",
      submit: "Salvar senha",
      submitting: "Salvando…",
      done: "Senha definida. Você já pode entrar.",
      expired: "Este link expirou ou já foi usado. Peça um novo.",
    },
    signUp: {
      title: "Criar conta",
      subtitle: "Crie a conta do seu estúdio ou consultoria.",
      organization: "Nome do estúdio ou consultoria",
      fullName: "Seu nome",
      submit: "Criar conta",
      submitting: "Criando…",
    },
    errors: {
      invalidCredentials: "E-mail ou senha incorretos.",
      rateLimited: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
      linkInvalid: "Link inválido ou expirado. Peça um novo.",
      noProfile: "Esta conta não tem acesso ao painel do treinador.",
      generic: "Não foi possível concluir. Tente novamente.",
    },
  },
  students: {
    title: "Meus alunos",
    counter: (active: number, limit: number) => `${active} ativos · limite ${limit}`,
    publicSignups: "Cadastros públicos",
    export: "Exportar",
    exportCsv: "Planilha CSV",
    exportXlsx: "Excel (XLSX)",
    add: "Adicionar aluno",
    searchPlaceholder: "Buscar por nome, e-mail ou matrícula",
    searchLabel: "Buscar alunos",
    tabs: { active: "Ativos", inactive: "Inativos", expired: "Expirados" },
    sort: {
      label: "Ordenar",
      "name:asc": "Nome A–Z",
      "name:desc": "Nome Z–A",
      "created:desc": "Mais recentes",
      "expires:asc": "Expiração (mais próxima)",
      "expires:desc": "Expiração (mais distante)",
    },
    filters: { class: "Turma", allClasses: "Todas as turmas", group: "Grupo especial", allGroups: "Todos os grupos", clear: "Limpar filtros" },
    view: { label: "Visualização", list: "Lista", cards: "Cards" },
    columns: {
      student: "Aluno",
      enrollment: "Matrícula",
      email: "E-mail",
      ageSex: "Idade · Sexo",
      trainer: "Professor",
      status: "Status",
      groups: "Grupos especiais",
      actions: "Ações",
    },
    status: { active: "Ativo", blocked: "Bloqueado", inactive: "Inativo", expired: "Expirado" },
    sex: { M: "Masculino", F: "Feminino" },
    noTrainer: "Sem professor",
    expiresOn: (date: string) => `Expira em ${date}`,
    expiredOn: (date: string) => `Expirou em ${date}`,
    pagination: (from: number, to: number, total: number) => `${from}–${to} de ${total}`,
    empty: {
      active: "Nenhum aluno ativo por aqui.",
      inactive: "Nenhum aluno inativo. Alunos desativados aparecem aqui e não ocupam vaga.",
      expired: "Nenhum aluno com acesso expirado.",
      search: "Nenhum aluno encontrado com esses filtros.",
    },
    menu: {
      label: (name: string) => `Ações para ${name}`,
      whatsapp: "Abrir WhatsApp",
      whatsappMissing: "Sem WhatsApp cadastrado",
      whatsappGreeting: (name: string) => `Olá, ${name}! Tudo bem?`,
      edit: "Editar",
      copyLink: "Copiar link de acesso",
      resendInvite: "Reenviar convite",
      deactivate: "Desativar",
      reactivate: "Reativar",
      expire: "Expirar acesso",
      clearExpiration: "Limpar expiração",
      delete: "Excluir",
    },
    confirm: {
      deactivateTitle: "Desativar aluno?",
      deactivateText: "O aluno perde o acesso ao app e deixa de ocupar vaga no plano. Você pode reativá-lo depois.",
      expireTitle: "Expirar acesso agora?",
      expireText: "O acesso do aluno expira imediatamente e ele deixa de ocupar vaga.",
      deleteTitle: "Excluir aluno?",
      deleteText: (name: string) => `O aluno sai das listagens e libera a vaga. Para confirmar, digite o nome completo: ${name}`,
      deleteLabel: "Nome completo do aluno",
      cancel: "Cancelar",
    },
    actions: {
      deactivated: "Aluno desativado.",
      reactivated: "Aluno reativado.",
      expired: "Acesso expirado.",
      expirationCleared: "Expiração removida.",
      deleted: "Aluno excluído.",
      linkCopied: "Link copiado. Ele vale por 30 minutos e só pode ser usado uma vez.",
      linkCopyFailed: "Não foi possível copiar. Copie o link manualmente:",
      inviteSent: "E-mail de acesso enviado.",
      emailFailed: "Não foi possível enviar o e-mail. Verifique a configuração de SMTP do Supabase.",
      emailInUse: "Este e-mail já tem acesso ao LFit em outra conta.",
    },
  },
  access: {
    title: "Acessar o LFit",
    subtitle: "Seu professor enviou um link para você definir sua senha.",
    continue: "Continuar",
    continuing: "Abrindo…",
    invalid: "Este link expirou ou já foi usado. Peça um novo ao seu professor.",
    readyTitle: "Senha definida!",
    readyText: "Seu acesso está pronto. O app do aluno estará disponível em breve — seu professor avisará.",
  },
  validation: {
    required: "Campo obrigatório.",
    email: "Informe um e-mail válido.",
    passwordMin: "A senha precisa ter pelo menos 8 caracteres.",
    passwordMax: "A senha pode ter no máximo 72 caracteres.",
    passwordMismatch: "As senhas não conferem.",
  },
  /** Erros de negócio vindos das RPCs do banco (mensagem = código estável). */
  dbErrors: {
    FORBIDDEN: "Você não tem permissão para esta ação.",
    STUDENT_NOT_FOUND: "Aluno não encontrado.",
    PLAN_LIMIT_REACHED: "Você atingiu o limite de alunos do seu plano.",
    INVALID_INPUT: "Confira os dados informados.",
    INVALID_TRAINER: "Professor inválido para esta conta.",
    INVALID_GROUP: "Grupo especial inválido.",
    HEALTH_CONSENT_REQUIRED: "É necessário o consentimento do aluno para registrar dados de saúde.",
    CONFIRMATION_MISMATCH: "O nome digitado não confere.",
    SIGNUP_LINK_INVALID: "Este link de cadastro não está disponível.",
  },
} as const;

export type DbErrorCode = keyof typeof messages.dbErrors;

/** Traduz um erro vindo do Supabase/RPC para uma mensagem amigável. */
export function dbErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return messages.auth.errors.generic;
  if (error.message && error.message in messages.dbErrors) {
    return messages.dbErrors[error.message as DbErrorCode];
  }
  if (error.code === "23505") return "Já existe um cadastro com esses dados.";
  return messages.auth.errors.generic;
}
