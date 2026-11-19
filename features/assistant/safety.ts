/**
 * Camada de segurança DETERMINÍSTICA do Assistente de IA: expressões de dor/sintoma em pt-BR. Quem decide de verdade é
 * o banco (`private.ai_safety_hit` em 20261119140000, antes de qualquer chamada ao modelo); esta cópia serve à tela e
 * aos testes. tests/unit/assistant.test.ts exige que as duas listas sejam iguais.
 */
import { stripAccents } from "@/lib/text";

export const SAFETY_TERMS = [
  "dor", "dores", "doendo", "doeu", "doi", "doer", "dolorido", "dolorida", "pontada", "pontadas", "fisgada",
  "fisgou", "formigamento", "formigando", "formigar", "dormencia", "dormente", "adormecido", "adormeceu",
  "tontura", "tonto", "tonta", "zonzo", "zonza", "vertigem", "falta de ar", "sem ar", "nao consigo respirar",
  "enjoo", "enjoado", "enjoada", "nausea", "vomito", "vomitei", "vomitar", "desmaio", "desmaiar", "desmaiei",
  "desmaiando", "dor no peito", "aperto no peito", "palpitacao", "coracao disparado", "estalo", "estalou",
  "estalando", "travou", "travada", "travado", "torci", "torceu", "machuquei", "machucou", "lesionei",
  "sangrando", "sangue", "inchado", "inchada", "inchou", "caimbra", "caibra", "visao turva", "vista escura",
  "escureceu", "mal estar", "passando mal", "choque", "choquinho", "queimacao", "queimando", "ardendo",
  "ardencia", "agulhada", "irradia", "irradiando", "incomodo", "incomodando", "desconforto", "latejando",
  "fraqueza", "perna fraca", "perdi a forca", "sem forca", "nao sinto", "sem sensibilidade", "incontinencia",
  "perdi o controle", "xixi", "urina", "hernia", "ciatico", "ciatica",
] as const;

/** Mesma normalização do banco: minúsculas, sem acento, só letras/dígitos separados por um espaço. */
export function normalizeForSafety(text: string): string {
  return stripAccents(text.toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();
}

export function safetyHit(text: string): boolean {
  const k = ` ${normalizeForSafety(text)} `;
  return SAFETY_TERMS.some((term) => k.includes(` ${term} `));
}
