import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPendingRedFlag, RED_FLAG_KEYS } from "@/features/knowledge/red-flags";
import { redFlagCheckSchema, redFlagClearanceSchema } from "@/features/knowledge/red-flag-schemas";

describe("triagem de sinais de alerta", () => {
  it("lista igual à do banco (private.red_flag_keys)", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261008120100_red_flag_triage.sql"), "utf8");
    const body = /create function private\.red_flag_keys\(\)[\s\S]*?array\[([\s\S]*?)\]/.exec(sql)![1];
    expect([...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual(RED_FLAG_KEYS);
  });

  it("marcar sinais OU 'nenhum destes sinais' — nunca os dois, nunca nada", () => {
    const v = (extra: Record<string, unknown>) => ({ items: [], noneObserved: false, referred: false, note: "", ...extra });
    expect(redFlagCheckSchema.safeParse(v({ noneObserved: true })).success).toBe(true);
    expect(redFlagCheckSchema.safeParse(v({ items: ["recent_trauma"], referred: true })).success).toBe(true);
    expect(redFlagCheckSchema.safeParse(v({})).success).toBe(false);
    expect(redFlagCheckSchema.safeParse(v({ items: ["recent_trauma"], noneObserved: true })).success).toBe(false);
    expect(redFlagCheckSchema.safeParse(v({ items: ["diagnostico"] })).success).toBe(false);
    // Encaminhamento só com sinais.
    expect(redFlagCheckSchema.safeParse(v({ noneObserved: true, referred: true })).success).toBe(false);
  });

  it("liberação exige quem, nome e data válida", () => {
    const ok = { kind: "medico", name: "Dra. Ana", on: "25/09/2026", note: "" };
    expect(redFlagClearanceSchema.safeParse(ok).success).toBe(true);
    expect(redFlagClearanceSchema.safeParse({ ...ok, kind: "" }).success).toBe(false);
    expect(redFlagClearanceSchema.safeParse({ ...ok, name: "A" }).success).toBe(false);
    expect(redFlagClearanceSchema.safeParse({ ...ok, on: "31/02/2026" }).success).toBe(false);
  });

  it("aviso só com sinais e sem liberação", () => {
    const base = { id: "x", note: null, referred: false, recordedAt: "2026-09-25T12:00:00Z" };
    expect(isPendingRedFlag(null)).toBe(false);
    expect(isPendingRedFlag({ ...base, items: [], clearance: null })).toBe(false);
    expect(isPendingRedFlag({ ...base, items: ["recent_trauma"], clearance: null })).toBe(true);
    expect(isPendingRedFlag({ ...base, items: ["recent_trauma"], clearance: { kind: "medico", name: "X", on: "2026-09-25", note: null } })).toBe(false);
  });
});
