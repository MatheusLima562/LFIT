import type { GuideTone } from "./types";

/**
 * Sinais de alerta da triagem (relatados pelo aluno ou observados pelo professor) — tirados dos documentos
 * aprovados em docs/conhecimento/ (seção 5). Não são diagnóstico. As chaves são iguais às de
 * private.red_flag_keys() no banco (teste unitário confere); mudar a lista exige migration.
 */
export const RED_FLAGS = [
  { key: "chest_pain_exertion", tone: "emergency", label: "Dor no peito, ou dor no ombro/braço com esforço acompanhada de falta de ar ou sudorese" },
  { key: "neuro_vascular", tone: "emergency", label: "Dor de cabeça súbita e intensa, tontura, fala enrolada, visão dupla, dificuldade para engolir ou desequilíbrio" },
  { key: "sudden_breathlessness", tone: "emergency", label: "Falta de ar súbita" },
  { key: "bladder_bowel_saddle", tone: "sameDay", label: "Alteração para urinar/evacuar ou dormência na região da “sela” (nádegas, parte interna das coxas)" },
  { key: "calf_swelling", tone: "sameDay", label: "Panturrilha ou perna inchada e dolorida" },
  { key: "hot_swollen_joint", tone: "sameDay", label: "Articulação quente e inchada, com ou sem febre" },
  { key: "progressive_weakness", tone: "refer", label: "Fraqueza ou dormência que está piorando (braço ou perna)" },
  { key: "bilateral_symptoms", tone: "refer", label: "Sintomas nos dois lados (braços ou pernas)" },
  { key: "recent_trauma", tone: "refer", label: "Trauma recente (queda, acidente) com dor" },
  { key: "dislocation", tone: "refer", label: "Luxação ou sensação de a articulação “sair do lugar”" },
  { key: "cancer_weight_night", tone: "refer", label: "História de câncer, perda de peso sem explicação ou dor noturna que impede dormir" },
  { key: "fever_infection", tone: "refer", label: "Febre junto da dor ou imunidade baixa (ex.: uso prolongado de corticoide)" },
  { key: "rapid_worsening", tone: "refer", label: "Piora rápida ou sintomas novos e diferentes" },
] as const satisfies readonly { key: string; tone: GuideTone; label: string }[];

export type RedFlagKey = (typeof RED_FLAGS)[number]["key"];
export const RED_FLAG_KEYS = RED_FLAGS.map((f) => f.key) as RedFlagKey[];

export const CLEARANCE_KINDS = ["medico", "fisioterapeuta"] as const;
export type ClearanceKind = (typeof CLEARANCE_KINDS)[number];

export const RED_FLAG_NOTE_MAX = 300;

export function redFlagLabel(key: string): string {
  return RED_FLAGS.find((f) => f.key === key)?.label ?? key;
}

/** Triagem mais recente do aluno (nível completo de saúde). */
export interface RedFlagCheck {
  id: string;
  items: RedFlagKey[];
  note: string | null;
  recordedAt: string;
  clearance: { kind: ClearanceKind; name: string | null; on: string; note: string | null } | null;
}

/** Aviso no montador: há sinais na última triagem e nenhuma liberação registrada. */
export function isPendingRedFlag(check: RedFlagCheck | null): boolean {
  return !!check && check.items.length > 0 && !check.clearance;
}
