import { describe, expect, it } from "vitest";
import { matchesCondition, orderByRegion, parseSearchTerms } from "@/features/conditions/regions";

const node = (id: string, name: string, parentId: string | null = null, searchTerms: string[] = []) => ({ id, name, parentId, searchTerms });

describe("regiões de condições", () => {
  const all = [
    node("j", "Joelho"),
    node("pfp", "Dor patelofemoral", "j", ["condromalácia"]),
    node("l", "Coluna lombar"),
    node("h", "Hérnia discal lombar (intolerância à flexão)", "l"),
    node("art", "Artrose de joelho", "j", ["osteoartrite"]),
    node("orf", "Órfã", "sumiu"),
  ];

  it("cada região vem seguida das suas condições, em ordem alfabética; órfã vira raiz", () => {
    expect(orderByRegion(all).map((c) => c.id)).toEqual(["l", "h", "j", "art", "pfp", "orf"]);
  });

  it("busca sem acento em nome, sinônimos e região", () => {
    const hits = (q: string) => all.filter((c) => matchesCondition(c, q, all)).map((c) => c.id);
    expect(hits("condromalacia")).toEqual(["pfp"]);
    expect(hits("OSTEO")).toEqual(["art"]);
    expect(hits("joelho")).toEqual(["j", "pfp", "art"]);
    expect(hits("  ")).toHaveLength(all.length);
  });

  it("sinônimos: separa por vírgula, apara, sem vazios nem repetidos (ignorando acento)", () => {
    expect(parseSearchTerms(" hérnia de disco,  ciática ,, Ciatica ,protrusão  discal")).toEqual(["hérnia de disco", "ciática", "protrusão discal"]);
    expect(parseSearchTerms("")).toEqual([]);
  });
});
