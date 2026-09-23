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
