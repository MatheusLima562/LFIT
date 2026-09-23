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
import type { NavChild, NavItem, NavSection } from "@/types/dashboard";

export const navigation: NavSection[] = [
  {
    id: "principal",
    items: [
      { id: "inicio", label: "Início", href: "/", icon: House },
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

/** Busca uma rota da navegação (item ou subitem) pelo pathname. */
export function findRoute(
  pathname: string,
): { item: NavItem; child?: NavChild } | undefined {
  for (const section of navigation) {
    for (const item of section.items) {
      const child = item.children?.find((c) => c.href === pathname);
      if (child) return { item, child: child.href === item.href ? undefined : child };
      if (item.href === pathname) return { item };
    }
  }
  return undefined;
}

/** Todas as rotas de módulo (exceto a home), para gerar páginas estáticas. */
export function moduleRoutes(): string[] {
  const routes = new Set<string>();
  for (const section of navigation) {
    for (const item of section.items) {
      if (item.href !== "/") routes.add(item.href);
      item.children?.forEach((c) => routes.add(c.href));
    }
  }
  return [...routes];
}

export function isRouteActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
