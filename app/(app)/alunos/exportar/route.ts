import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/db/server";
import { ageFrom, formatDate, formatEnrollment } from "@/lib/format";
import { messages } from "@/messages/pt-BR";
import { listStudents, type StudentRow } from "@/features/students/queries";
import { parseStudentListParams } from "@/features/students/search-params";

/** Teto de linhas por exportação (evita respostas gigantes; ajustar com paginação se preciso). */
const EXPORT_LIMIT = 5000;
const t = messages.students;

const baseHeaders = [
  t.columns.enrollment,
  "Nome",
  t.columns.email,
  "WhatsApp",
  "Idade",
  "Sexo",
  t.columns.trainer,
  t.columns.status,
  "Expiração do acesso",
];

/** Grupos especiais são dado de saúde: só entram com opt-in explícito (`saude=1`). */
function toCells(s: StudentRow, includeHealth: boolean) {
  const cells: (string | number)[] = [
    formatEnrollment(s.enrollmentNumber),
    s.fullName,
    s.email,
    s.whatsapp ?? "",
    s.birthDate ? ageFrom(s.birthDate) : "",
    s.sex ? t.sex[s.sex] : "",
    s.trainerName ?? "",
    t.status[s.status],
    s.accessExpiresAt ? formatDate(s.accessExpiresAt) : "",
  ];
  if (includeHealth) cells.push(s.groups.map((g) => g.name).join(", "));
  return cells;
}

const headersFor = (includeHealth: boolean) => (includeHealth ? [...baseHeaders, t.columns.groups] : baseHeaders);

/** CSV com ";" e BOM UTF-8 — abre corretamente no Excel em pt-BR. */
function toCsv(rows: StudentRow[], includeHealth: boolean) {
  const escape = (v: string | number) => {
    const s = String(v);
    // Prefixo contra injeção de fórmula em planilhas (=, +, -, @). Telefones E.164
    // (validados pelo banco: só "+" e dígitos) ficam como estão.
    const isE164 = /^\+[1-9]\d{7,14}$/.test(s);
    const safe = !isE164 && /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [headersFor(includeHealth), ...rows.map((r) => toCells(r, includeHealth))].map((cells) =>
    cells.map(escape).join(";"),
  );
  return `\uFEFF${lines.join("\r\n")}`;
}

async function toXlsx(rows: StudentRow[], includeHealth: boolean) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LFit";
  const sheet = workbook.addWorksheet(t.title);
  sheet.addRow(headersFor(includeHealth)).font = { bold: true };
  rows.forEach((s) => sheet.addRow(toCells(s, includeHealth)));
  sheet.columns.forEach((col) => (col.width = 22));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return workbook.xlsx.writeBuffer();
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "student") return new NextResponse(null, { status: 401 });

  const search = Object.fromEntries(request.nextUrl.searchParams);
  const format = search.format === "xlsx" ? "xlsx" : "csv";
  const params = parseStudentListParams(search);
  const includeHealth = search.saude === "1";

  // Filtrar por grupo especial também revela dado de saúde: exige o mesmo opt-in.
  if (params.grupo && !includeHealth) {
    return new NextResponse("Exportar filtrando por grupo especial exige confirmação de dados de saúde.", { status: 400 });
  }

  const { rows } = await listStudents(params, { limit: EXPORT_LIMIT });

  const supabase = await createClient();
  await supabase.rpc("log_students_export", {
    p_format: format,
    p_count: rows.length,
    p_filters: {
      status: params.status,
      sort: params.sort,
      turma: params.turma ?? null,
      grupo: params.grupo ?? null,
      busca: Boolean(params.q),
      dados_saude: includeHealth,
    },
  });

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const filename = `alunos-${params.status}-${stamp}.${format}`;
  const body = format === "xlsx" ? await toXlsx(rows, includeHealth) : toCsv(rows, includeHealth);

  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type":
        format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
