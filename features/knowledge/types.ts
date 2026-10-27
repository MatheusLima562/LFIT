/** Conduta de um grupo de sinais de alerta (define cor/ícone e ordem). */
export type GuideTone = "emergency" | "sameDay" | "refer";

export interface GuideTable {
  title: string;
  /** "alert": linhas que geram alerta de cautela no montador; "guide": só orientação. */
  kind: "alert" | "guide";
  columns: string[];
  rows: string[][];
}

export interface GuideReference {
  id: string;
  text: string;
  url: string | null;
}

/** Guia de uma condição global (texto com **negrito** simples; nunca HTML). */
export interface Guide {
  /** Chave da condição global em health_conditions.key. */
  key: string;
  title: string;
  /** Documento de origem em docs/conhecimento/. */
  source: string;
  summary: string[];
  tables: GuideTable[];
  notes: string[];
  redFlags: { title: string; tone: GuideTone; items: string[] }[];
  avoidWords: string[];
  phrases: string[];
  references: GuideReference[];
}
