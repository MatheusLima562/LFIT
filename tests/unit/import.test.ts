import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IMPORT_DECLARATION_VERSION } from "@/features/import/declaration";
import { canUndo, undoDeadline } from "@/features/import/undo";
import { emptyMapping, looksLikeHealth, missingRequired, suggestMapping } from "@/features/import/fields";
import { checkSheet, decodeText, detectDelimiter, fileKind, parseCsv, toSheet } from "@/features/import/parse";
import { batches, parseFlexibleDate, parseImportResponse, rejectedCsv, templateCsv, validateAll } from "@/features/import/validate";
import { messages } from "@/messages/pt-BR";

const TODAY = "2026-11-19";

describe("decodeText", () => {
  it("UTF-8 com e sem BOM", () => {
    const utf8 = new TextEncoder().encode("Situação;João");
    expect(decodeText(utf8)).toEqual({ text: "Situação;João", encoding: "utf-8" });
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])).text).toBe("Situação;João");
  });
  it("Windows-1252 (Excel no Windows)", () => {
    // "Situação" em 1252: ç = 0xE7, ã = 0xE3
    const bytes = new Uint8Array([0x53, 0x69, 0x74, 0x75, 0x61, 0xe7, 0xe3, 0x6f]);
    expect(decodeText(bytes)).toEqual({ text: "Situação", encoding: "windows-1252" });
  });
});

describe("CSV", () => {
  it("detecta o separador", () => {
    expect(detectDelimiter("nome;email\nA;b")).toBe(";");
    expect(detectDelimiter("nome,email\nA,b")).toBe(",");
    expect(detectDelimiter("nome\temail")).toBe("\t");
    expect(detectDelimiter('"a;b",c,d')).toBe(",");
  });
  it("aspas, aspas duplicadas, quebra de linha em aspas e CRLF", () => {
    expect(parseCsv('nome;obs\r\n"Silva; Ana";"diz ""oi""\nlinha 2"\r\n')).toEqual([
      ["nome", "obs"],
      ["Silva; Ana", 'diz "oi"\nlinha 2'],
    ]);
  });
  it("número da linha bate com o arquivo, pulando linhas vazias", () => {
    const s = toSheet(parseCsv("nome;email\n\nAna Lima;a@x.com\n;\nBia Souza;b@x.com"));
    expect(s.headers).toEqual(["nome", "email"]);
    expect(s.rows.map((r) => r.line)).toEqual([3, 5]);
  });
  it("cabeçalho vazio vira Coluna N; arquivo sem dados é recusado", () => {
    expect(toSheet([["nome", ""], ["a", "b"]]).headers).toEqual(["nome", "Coluna 2"]);
    expect(checkSheet(toSheet([["nome"]]))).toBe("empty");
    const many = [["nome"], ...Array.from({ length: 2001 }, () => ["x"])];
    expect(checkSheet(toSheet(many))).toBe("too_many_rows");
    expect(checkSheet(toSheet(many.slice(0, 2001)))).toBeNull();
  });
  it("tipo pelo nome do arquivo", () => {
    expect(fileKind("alunos.CSV")).toBe("csv");
    expect(fileKind("alunos.xlsx")).toBe("xlsx");
    expect(fileKind("alunos.xls")).toBeNull();
  });
});

describe("sugestão de colunas", () => {
  it("pt-BR e en, com acento e caixa diferentes", () => {
    const m = suggestMapping(["Nome Completo", "E-mail", "Celular", "Data de Nascimento", "Objetivo", "Observações", "Data de início", "Modalidade", "Situação"]);
    expect(m).toMatchObject({ name: 0, email: 1, phone: 2, birth_date: 3, goal: 4, notes: 5, start_date: 6, modality: 7, status: 8, last_name: null });
    const en = suggestMapping(["Full name", "Email address", "Phone", "Birthday", "Goals", "Notes", "Start date", "Type", "Status"]);
    expect(en).toMatchObject({ name: 0, email: 1, phone: 2, birth_date: 3, goal: 4, notes: 5, start_date: 6, modality: 7, status: 8 });
  });
  it("nome + sobrenome separados; coluna desconhecida fica sem mapear", () => {
    const m = suggestMapping(["Nome", "Sobrenome", "Email", "Hotel"]);
    expect(m).toMatchObject({ name: 0, last_name: 1, email: 2, phone: null });
  });
  it("uma coluna só serve a um campo; obrigatórios faltando", () => {
    const m = suggestMapping(["Nome", "Nome"]);
    expect(m.name).toBe(0);
    expect(missingRequired(m)).toEqual(["email"]);
    expect(missingRequired(emptyMapping())).toEqual(["name", "email"]);
  });
});

describe("colunas com cara de saúde", () => {
  it("nenhuma é sugerida, nem a de observações médicas", () => {
    const headers = [
      "Nome", "E-mail", "Lesões", "Restrição", "Patologias", "Anamnese", "Dor", "Doença", "Medicamentos", "Cirurgia",
      "Observações médicas", "Histórico clínico", "Observações",
    ];
    const m = suggestMapping(headers);
    expect(m.name).toBe(0);
    expect(m.email).toBe(1);
    expect(m.notes).toBe(12); // a de observações comum, não a médica
    const suggested = Object.values(m).filter((v): v is number => v !== null);
    for (let i = 2; i <= 11; i++) expect(suggested).not.toContain(i);
    expect(headers.slice(2, 12).every(looksLikeHealth)).toBe(true);
  });
  it("só as médicas existindo: observações ficam sem sugestão", () => {
    expect(suggestMapping(["Nome", "Email", "Observações médicas"]).notes).toBeNull();
    expect(suggestMapping(["Nome", "Email", "Obs. de saúde"]).notes).toBeNull();
  });
  it("sem falso positivo em palavras parecidas", () => {
    for (const h of ["Endereço", "Dorsal", "Condomínio", "Data de início", "Objetivo", "Celular"]) expect(looksLikeHealth(h)).toBe(false);
  });
  it("o aviso fixo existe com o texto pedido", () => {
    expect(messages.importer.healthWarning).toBe("Não importe dados de saúde nas observações; cadastre-os depois na ficha do aluno.");
  });
});

describe("validação", () => {
  const headers = ["Nome", "E-mail", "Celular", "Nascimento", "Objetivo", "Obs", "Início", "Modalidade", "Status"];
  const mapping = suggestMapping(headers);
  const row = (cells: string[], line = 2) => ({ line, cells });

  it("linha completa", () => {
    const [v] = validateAll([row(["Ana  Maria Lima", "ANA@Example.com", "(41) 99901-0287", "31/12/1990", "Hipertrofia", "Joelho ok", "2026-03-01", "Online", "Ativo"])], mapping, TODAY);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect(v.payload).toEqual({
      row: 2,
      first_name: "Ana",
      last_name: "Maria Lima",
      email: "ana@example.com",
      whatsapp_e164: "+5541999010287",
      birth_date: "1990-12-31",
      notes: "Joelho ok\nObjetivo: Hipertrofia\nInício (importado): 01/03/2026",
      modality: "consultoria",
      status: "active",
    });
  });

  it("erros bloqueiam a linha; avisos não", () => {
    const rows = validateAll(
      [
        row(["Ana", "ana@x.com", "", "", "", "", "", "", ""], 2),
        row(["Bia Souza", "", "", "", "", "", "", "", ""], 3),
        row(["Caio Reis", "caio@", "", "", "", "", "", "", ""], 4),
        row(["Dani Alves", "dani@x.com", "123", "31/02/1990", "", "", "amanhã", "yoga", "talvez"], 5),
        row(["Eva Melo", "DANI@x.com", "", "", "", "", "", "", ""], 6),
        // Cada célula cabe (≤ 2000), mas observações + "Objetivo: …" juntas passam de 2000.
        row(["Fabi Lins", "fabi@x.com", "", "", "Hipertrofia", "x".repeat(1995), "", "", "inativo"], 7),
      ],
      mapping,
      TODAY,
    );
    expect(rows.map((r) => r.errors)).toEqual([
      ["last_name_missing"],
      ["email_missing"],
      ["email_invalid"],
      [],
      ["email_duplicate_in_file"],
      ["notes_too_long"],
    ]);
    expect(rows[3].warnings).toEqual(["phone_invalid", "birth_date_invalid", "start_date_invalid", "modality_unknown", "status_unknown"]);
    expect(rows[3].payload).toMatchObject({ whatsapp_e164: null, birth_date: null, notes: null, modality: "consultoria", status: "active" });
  });

  it("nascimento no futuro é aviso; status inativo e presencial reconhecidos", () => {
    const [v] = validateAll([row(["Gil Nunes", "gil@x.com", "", "01/01/2030", "", "", "", "Presencial", "inativo"])], mapping, TODAY);
    expect(v.warnings).toEqual(["birth_date_invalid"]);
    expect(v.payload).toMatchObject({ status: "inactive", modality: "presencial", birth_date: null });
  });

  it("datas aceitas", () => {
    expect(parseFlexibleDate("1/2/1990")).toBe("1990-02-01");
    expect(parseFlexibleDate("01.02.1990")).toBe("1990-02-01");
    expect(parseFlexibleDate("1990-02-01T00:00:00")).toBe("1990-02-01");
    expect(parseFlexibleDate("01/02/90")).toBeNull();
    expect(parseFlexibleDate("30/02/1990")).toBeNull();
  });
});

describe("limite por célula, declaração e desfazer", () => {
  const mapping = suggestMapping(["Nome", "E-mail", "Observações"]);
  it("célula acima do limite recusa a linha", () => {
    const [ok] = validateAll([{ line: 2, cells: ["Ana Lima", "a@x.com", "x".repeat(2000)] }], mapping, TODAY);
    expect(ok.errors).toEqual([]);
    const [big] = validateAll([{ line: 2, cells: ["Ana Lima", "a@x.com", "x".repeat(2001)] }], mapping, TODAY);
    expect(big.errors).toEqual(["cell_too_long"]);
    const [name] = validateAll([{ line: 2, cells: [`Ana ${"y".repeat(130)}`, "a@x.com", ""] }], mapping, TODAY);
    expect(name.errors).toEqual(["cell_too_long"]);
    const [mail] = validateAll([{ line: 2, cells: ["Ana Lima", `${"z".repeat(250)}@x.com`, ""] }], mapping, TODAY);
    expect(mail.errors).toEqual(["cell_too_long"]);
  });
  it("a versão da declaração do código está aceita na migration", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261119130000_student_import.sql"), "utf8");
    expect(sql).toContain(`insert into private.import_declarations (version) values ('${IMPORT_DECLARATION_VERSION}')`);
    expect(messages.importer.declaration).toMatch(/base legal/);
    expect(messages.importer.declaration).toMatch(/informá-los/);
  });
  it("desfazer só até 7 dias, não desfeito e com alunos criados", () => {
    const created = "2026-11-10T12:00:00Z";
    const at = (iso: string) => Date.parse(iso);
    expect(undoDeadline(created)).toBe("2026-11-17T12:00:00.000Z");
    expect(canUndo({ createdAt: created, undoneAt: null, created: 3 }, at("2026-11-17T11:59:59Z"))).toBe(true);
    expect(canUndo({ createdAt: created, undoneAt: null, created: 3 }, at("2026-11-17T12:00:00Z"))).toBe(false);
    expect(canUndo({ createdAt: created, undoneAt: "2026-11-11T00:00:00Z", created: 3 }, at("2026-11-12T00:00:00Z"))).toBe(false);
    expect(canUndo({ createdAt: created, undoneAt: null, created: 0 }, at("2026-11-12T00:00:00Z"))).toBe(false);
  });
});

describe("envio e relatório", () => {
  it("lotes de 200", () => {
    expect(batches(Array.from({ length: 450 }, (_, i) => i)).map((b) => b.length)).toEqual([200, 200, 50]);
  });
  it("resposta do servidor: códigos conhecidos; formato estranho = falha do lote", () => {
    expect(
      parseImportResponse({ created: 1, results: [{ row: 2, ok: true }, { row: 3, ok: false, error: "DUPLICATE_EMAIL" }, { row: 4, ok: false, error: "algo interno" }] }, [2, 3, 4]),
    ).toEqual([
      { row: 2, ok: true },
      { row: 3, ok: false, error: "DUPLICATE_EMAIL" },
      { row: 4, ok: false, error: "IMPORT_ROW_FAILED" },
    ]);
    expect(parseImportResponse(null, [9])).toEqual([{ row: 9, ok: false, error: "IMPORT_ROW_FAILED" }]);
  });
  it("planilha-modelo é lida de volta pela própria importação", () => {
    const csv = templateCsv(messages.importer.fields);
    const s = toSheet(parseCsv(decodeText(new TextEncoder().encode(csv)).text));
    const m = suggestMapping(s.headers);
    expect(missingRequired(m)).toEqual([]);
    const [v] = validateAll(s.rows, m, TODAY);
    expect(v.errors).toEqual([]);
    expect(v.payload?.email).toMatch(/@example\.com$/);
  });
  it("linhas recusadas com aspas e separador escapados", () => {
    const csv = rejectedCsv(["nome"], [{ line: 3, reason: "Sem e-mail", cells: ['Ana; "A"'] }], { line: "Linha", reason: "Motivo" });
    expect(csv).toBe('﻿Linha;Motivo;nome\r\n3;Sem e-mail;"Ana; ""A"""\r\n');
  });
});
