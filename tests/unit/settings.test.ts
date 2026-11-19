import { describe, expect, it } from "vitest";
import { brandingPath, exportToCsv } from "@/features/settings/settings";
import { navigation } from "@/data/navigation";

describe("configurações (lógica pura)", () => {
  it("caminhos de logo e foto no bucket org-branding", () => {
    expect(brandingPath("org", "logo", "f1", "image/webp")).toBe("org/logo-f1.webp");
    expect(brandingPath("org", "avatar", "f1", "image/jpeg", "u1")).toBe("org/avatar-u1-f1.jpg");
  });

  it("CSV de alunos: sem colunas de saúde sem o opt-in; fórmula neutralizada", () => {
    const rows = [{ enrollment_number: 7, first_name: "=HYPERLINK(\"x\")", last_name: "Silva", email: "a@x.com", whatsapp: "+5541999010287", status: "active", groups: "Dor", notes: "obs" }];
    const csv = exportToCsv("students", rows, false);
    const [header, line] = csv.replace(/^﻿/, "").split("\r\n");
    expect(header).not.toMatch(/saúde|Observações/);
    expect(line).toContain("'=HYPERLINK");
    expect(line).toContain("+5541999010287");
    expect(line).not.toContain("Dor");
    const withHealth = exportToCsv("students", rows, true);
    expect(withHealth).toContain("Grupos especiais (saúde)");
    expect(withHealth).toContain("Dor");
  });

  it("CSV do histórico: dor e comentário só com o opt-in", () => {
    const rows = [{ student: "Ana Lima", started_at: "2026-11-20T11:00:00Z", status: "completed", rpe: 7, pain_checkin: "ainda_incomoda", feedback_note: "-dor" }];
    const plain = exportToCsv("sessions", rows, false);
    expect(plain).not.toMatch(/Dor relatada|ainda_incomoda/);
    expect(plain).toContain("20/11/2026 08:00");
    const health = exportToCsv("sessions", rows, true);
    expect(health).toContain("ainda_incomoda");
    expect(health).toContain("'-dor");
  });

  it("Configurações e Suporte disponíveis no menu (sem 'Em breve')", () => {
    const items = navigation.flatMap((s) => s.items);
    expect(items.find((i) => i.href === "/configuracoes")?.status).toBe("available");
    expect(items.find((i) => i.href === "/suporte")?.status).toBe("available");
  });
});
