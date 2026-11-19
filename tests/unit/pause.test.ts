import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAUSE_REASONS, absenceThreshold, parseInactive, pauseActive } from "@/features/students/pause";
import { messages } from "@/messages/pt-BR";

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/20261120150000_pause_absence.sql"), "utf8");

describe("ausência e pausa (lógica pura)", () => {
  it("limite: 7 dias ou 1,5 × o intervalo previsto pelo plano, o que for maior", () => {
    expect(absenceThreshold(7, null)).toBe(7);
    expect(absenceThreshold(7, { days: 91, sessions: 36 })).toBe(7);
    expect(absenceThreshold(7, { days: 91, sessions: 9 })).toBe(16);
    expect(absenceThreshold(7, { days: 30, sessions: 0 })).toBe(7);
    expect(SQL).toContain("ceil(b.interval_days * 1.5)");
  });
  it("pausa sem data vale até encerrar; com data, até o fim do dia", () => {
    expect(pauseActive(null, "2026-11-20")).toBe(true);
    expect(pauseActive("2026-11-20", "2026-11-20")).toBe(true);
    expect(pauseActive("2026-11-19", "2026-11-20")).toBe(false);
  });
  it("motivos da pausa: só os da lista, nenhum de saúde (código e banco iguais)", () => {
    expect([...PAUSE_REASONS]).toEqual(["viagem", "ferias", "outro"]);
    expect(SQL).toContain("check (reason in ('viagem', 'ferias', 'outro'))");
    expect(JSON.stringify(messages.pause.reasons)).not.toMatch(/lesão|dor|doen|saúde/i);
  });
  it("leitura do Início: só nome e dias", () => {
    const [s] = parseInactive([{ student_id: "a", first_name: "Ana", last_name: "Lima", days_since: 10, threshold_days: 7, last_session_at: null, pain: 9 }]);
    expect(s).toEqual({ studentId: "a", firstName: "Ana", lastName: "Lima", daysSince: 10, thresholdDays: 7, lastSessionAt: null });
  });
  it("aviso ao aluno: texto gentil, sem cobrança", () => {
    expect(messages.nudge.text(9)).toBe("Faz 9 dias desde o seu último treino. Que tal voltar hoje, no seu ritmo?");
    expect(JSON.stringify(messages.nudge)).not.toMatch(/atras|falt[ao]u|deveria|cobr/i);
  });
});
