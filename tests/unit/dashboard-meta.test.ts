import { describe, expect, it } from "vitest";
import { dueMeta, sinceMeta, startOfTodaySP } from "@/features/dashboard/meta";

// 26/09/2026 às 01:30 em São Paulo = 04:30 UTC (ainda "hoje" 26/09 em SP).
const NOW = new Date("2026-09-26T04:30:00Z");

describe("Início: datas relativas em São Paulo", () => {
  it("vencimento do treino (fim às 23:59:59 SP)", () => {
    expect(dueMeta("2026-09-27T02:59:59Z", undefined, NOW)).toBe("vence hoje"); // 26/09 23:59:59 SP
    expect(dueMeta("2026-09-30T02:59:59Z", undefined, NOW)).toBe("vence em 3 dias");
    expect(dueMeta("2026-09-24T02:59:59Z", undefined, NOW)).toBe("venceu há 3 dias");
    expect(dueMeta("2026-09-28T02:59:59Z", { future: "expira", past: "expirou" }, NOW)).toBe("expira em 1 dia");
  });

  it("cadastro e início do dia", () => {
    expect(sinceMeta("2026-09-26T03:10:00Z", NOW)).toBe("cadastrado hoje"); // 00:10 SP
    expect(sinceMeta("2026-09-26T02:50:00Z", NOW)).toBe("cadastrado há 1 dia"); // 25/09 23:50 SP
    expect(startOfTodaySP(NOW)).toBe("2026-09-26T03:00:00.000Z");
  });
});
