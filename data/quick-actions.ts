import {
  CalendarPlus,
  ClipboardPlus,
  Dumbbell,
  MessageSquarePlus,
  Receipt,
  UserPlus,
} from "lucide-react";
import type { QuickAction } from "@/types/dashboard";

export const quickActions: QuickAction[] = [
  {
    id: "aluno",
    label: "Cadastrar aluno",
    menuLabel: "Aluno",
    description: "Convide um aluno para o app com acesso aos treinos.",
    icon: UserPlus,
    submitLabel: "Enviar convite",
    successMessage: "Convite enviado para o aluno.",
    fields: [
      { name: "name", label: "Nome completo", type: "text", placeholder: "Ex.: Ana Souza", required: true },
      { name: "email", label: "E-mail", type: "email", placeholder: "ana@email.com", required: true },
      { name: "phone", label: "WhatsApp", type: "tel", placeholder: "(11) 90000-0000" },
    ],
  },
  {
    id: "treino",
    label: "Montar treino",
    menuLabel: "Treino",
    description: "Crie um programa de treino do zero ou a partir de um modelo.",
    icon: Dumbbell,
    submitLabel: "Criar treino",
    successMessage: "Treino criado como rascunho.",
    fields: [
      { name: "name", label: "Nome do treino", type: "text", placeholder: "Ex.: Hipertrofia — ABC", required: true },
      { name: "template", label: "Começar a partir de", type: "select", options: ["Em branco", "Hipertrofia ABC", "Emagrecimento", "Funcional"] },
    ],
  },
  {
    id: "aula",
    label: "Agendar aula",
    menuLabel: "Aula",
    description: "Agende uma aula individual ou de turma.",
    icon: CalendarPlus,
    submitLabel: "Agendar",
    successMessage: "Aula agendada.",
    fields: [
      { name: "title", label: "Título", type: "text", placeholder: "Ex.: Funcional em grupo", required: true },
      { name: "date", label: "Data", type: "date", required: true },
    ],
  },
  {
    id: "avaliacao",
    label: "Nova avaliação",
    menuLabel: "Avaliação física",
    description: "Registre medidas, dobras e composição corporal.",
    icon: ClipboardPlus,
    submitLabel: "Iniciar avaliação",
    successMessage: "Avaliação iniciada.",
    fields: [
      { name: "student", label: "Aluno", type: "text", placeholder: "Nome do aluno", required: true },
      { name: "protocol", label: "Protocolo", type: "select", options: ["Pollock 7 dobras", "Pollock 3 dobras", "Bioimpedância"] },
    ],
  },
  {
    id: "cobranca",
    label: "Criar cobrança",
    menuLabel: "Cobrança",
    description: "Gere um link de pagamento via Pix ou cartão.",
    icon: Receipt,
    submitLabel: "Gerar link",
    successMessage: "Link de cobrança gerado.",
    fields: [
      { name: "student", label: "Aluno", type: "text", placeholder: "Nome do aluno", required: true },
      { name: "plan", label: "Plano", type: "select", options: ["Mensal", "Trimestral", "Semestral"] },
    ],
  },
  {
    id: "mensagem",
    label: "Enviar mensagem",
    menuLabel: "Mensagem",
    description: "Envie um aviso para um aluno ou para todos.",
    icon: MessageSquarePlus,
    submitLabel: "Enviar",
    successMessage: "Mensagem enviada.",
    fields: [
      { name: "to", label: "Para", type: "select", options: ["Todos os alunos ativos", "Alunos sem treino", "Um aluno específico"] },
      { name: "message", label: "Mensagem", type: "text", placeholder: "Escreva sua mensagem", required: true },
    ],
  },
];
