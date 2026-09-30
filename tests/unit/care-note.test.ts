import { describe, expect, it } from "vitest";
import { CARE_NOTE_MAX, suggestCareNote } from "@/features/plans/care-note";

describe("sugestão de orientação de cuidado", () => {
  it("usa a nota do pior alerta e acrescenta a regra de parar com dor; sem citar nível nem condição", () => {
    const s = suggestCareNote([
      { level: "caution", note: "Carga axial", restricted: false },
      { level: "avoid", note: "Flexão repetida da coluna (exemplo do seed).", restricted: false },
    ]);
    expect(s).toBe("Flexão repetida da coluna. Se a dor passar de 3/10, pare e avise o professor.");
    expect(s).not.toMatch(/Evitar|Cautela|avoid|caution/);
  });

  it("sem nota: texto neutro; só nível restrito ou sem alerta: nada a sugerir", () => {
    expect(suggestCareNote([{ level: "caution", note: null, restricted: false }])).toMatch(/^Faça com amplitude confortável/);
    expect(suggestCareNote([{ level: "avoid", note: null, restricted: true }])).toBeNull();
    expect(suggestCareNote([])).toBeNull();
  });

  it("nunca passa do limite do banco", () => {
    expect(suggestCareNote([{ level: "avoid", note: "x".repeat(400), restricted: false }])!.length).toBeLessThanOrEqual(CARE_NOTE_MAX);
  });
});
