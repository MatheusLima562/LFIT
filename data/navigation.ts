import {
  Apple,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  House,
  LifeBuoy,
  Megaphone,
  MessageCircle,
  Printer,
  Settings,
  TrendingUp,
  UserCog,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { NavSection } from "@/types/dashboard";

export const navigation: NavSection[] = [
  {
    id: "principal",
    items: [
      { id: "inicio", label: "Início", href: "/", icon: House, status: "available" },
      {
        id: "alunos",
        label: "Alunos",
        href: "/alunos",
        icon: Users,
        children: [
          { label: "Todos os alunos", href: "/alunos" },
          { label: "Anamneses", href: "/alunos/anamneses" },
          { label: "Grupos", href: "/alunos/grupos" },
        ],
      },
      { id: "turmas", label: "Turmas", href: "/turmas", icon: UsersRound },
      {
        id: "treinos",
        label: "Treinos & Exercícios",
        href: "/treinos",
        icon: Dumbbell,
        children: [
          { label: "Treinos", href: "/treinos" },
          { label: "Exercícios", href: "/treinos/exercicios" },
          { label: "Modelos prontos", href: "/treinos/modelos" },
        ],
      },
      { id: "avaliacao", label: "Avaliação", href: "/avaliacao", icon: ClipboardCheck },
      { id: "aulas", label: "Aulas", href: "/aulas", icon: CalendarDays },
      { id: "nutricao", label: "Nutrição", href: "/nutricao", icon: Apple },
      { id: "progresso", label: "Progresso", href: "/progresso", icon: TrendingUp },
    ],
  },
  {
    id: "negocio",
    title: "Negócio",
    items: [
      {
        id: "vendas",
        label: "Vendas",
        href: "/vendas",
        icon: Wallet,
        children: [
          { label: "Visão geral", href: "/vendas" },
          { label: "Planos e produtos", href: "/vendas/planos" },
          { label: "Cobranças", href: "/vendas/cobrancas" },
          { label: "Extrato", href: "/vendas/extrato" },
        ],
      },
      { id: "equipe", label: "Equipe", href: "/equipe", icon: UserCog },
      {
        id: "marketing",
        label: "Marketing",
        href: "/marketing",
        icon: Megaphone,
        children: [
          { label: "Página de vendas", href: "/marketing" },
          { label: "Cupons", href: "/marketing/cupons" },
          { label: "Indicações", href: "/marketing/indicacoes" },
        ],
      },
      { id: "chat", label: "Chat", href: "/chat", icon: MessageCircle, badge: 3 },
    ],
  },
  {
    id: "sistema",
    title: "Sistema",
    items: [
      { id: "configuracoes", label: "Configurações", href: "/configuracoes", icon: Settings },
      { id: "impressoes", label: "Impressões", href: "/impressoes", icon: Printer },
      { id: "suporte", label: "Suporte", href: "/suporte", icon: LifeBuoy },
    ],
  },
];

const allItems = () => navigation.flatMap((section) => section.items);

/**
 * A rota existe no app? Usado para desabilitar links para módulos "em breve"
 * (nada de links mortos). Query string é ignorada.
 */
export function isAvailableRoute(href: string) {
  const path = href.split("?")[0];
  const item = allItems().find(
    (i) => i.href === path || path.startsWith(`${i.href}/`) || i.children?.some((c) => c.href === path),
  );
  return item?.status === "available";
}

export function isRouteActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
