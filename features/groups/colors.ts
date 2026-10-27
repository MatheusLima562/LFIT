/** Paleta dos grupos especiais (marcador ao lado do nome; o texto usa tinta neutra). */
export const GROUP_COLORS = ["#f0642d", "#7c5cfc", "#1ba39c", "#e0a100", "#d6336c", "#2f80ed", "#6b7280"] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];
