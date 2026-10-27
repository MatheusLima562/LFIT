import { describe, expect, it } from "vitest";
import { parseStudentListParams, studentListHref } from "@/features/students/search-params";

describe("parâmetros da tela Meus alunos", () => {
  it("usa padrões quando a URL está vazia", () => {
    expect(parseStudentListParams({})).toEqual({ status: "active", sort: "name:asc", q: undefined, turma: undefined, grupo: undefined, page: 1 });
  });

  it("lê o estado da URL (inclusive valores repetidos)", () => {
    const p = parseStudentListParams({ status: "inactive", sort: "expires:desc", q: ["  Ana  ", "x"], page: "3" });
    expect(p).toMatchObject({ status: "inactive", sort: "expires:desc", q: "Ana", page: 3 });
  });

  it("valores inválidos voltam ao padrão em vez de quebrar a página", () => {
    const p = parseStudentListParams({ status: "hack", sort: "drop table", turma: "nao-e-uuid", page: "-2" });
    expect(p).toMatchObject({ status: "active", sort: "name:asc", turma: undefined, page: 1 });
  });

  it("monta URLs curtas, omitindo padrões", () => {
    expect(studentListHref({ status: "active", sort: "name:asc", page: 1 })).toBe("/alunos");
    expect(studentListHref({ status: "inactive", sort: "expires:desc", q: "ana", page: 2 })).toBe(
      "/alunos?status=inactive&sort=expires%3Adesc&q=ana&page=2",
    );
  });

  it("ida e volta preserva o estado", () => {
    const original = { status: "expired", sort: "created:desc", q: "joão", page: 4 } as const;
    const url = new URL(studentListHref(original), "http://x");
    expect(parseStudentListParams(Object.fromEntries(url.searchParams))).toMatchObject(original);
  });
});
