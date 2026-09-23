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

const headers = [
  t.columns.enrollment,
  "Nome",
  t.columns.email,
  "WhatsApp",
  "Idade",
  "Sexo",
  t.columns.trainer,
  t.columns.status,
  "Expiração do acesso",
  t.columns.groups,
];

function toCells(s: StudentRow) {
  return [
    formatEnrollment(s.enrollmentNumber),
    s.fullName,
    s.email,
    s.whatsapp ?? "",
    s.birthDate ? ageFrom(s.birthDate) : "",
    s.sex ? t.sex[s.sex] : "",
    s.trainerName ?? "",
    t.status[s.status],
    s.accessExpiresAt ? formatDate(s.accessExpiresAt) : "",
    s.groups.map((g) => g.name).join(", "),
  ];
}

/** CSV com ";" e BOM UTF-8 — abre corretamente no Excel em pt-BR. */
function toCsv(rows: StudentRow[]) {
  const escape = (v: string | number) => {
    const s = String(v);
    // Prefixo contra injeção de fórmula em planilhas (=, +, -, @). Telefones E.164
    // (validados pelo banco: só "+" e dígitos) ficam como estão.
    const isE164 = /^\+[1-9]\d{7,14}$/.test(s);
    const safe = !isE164 && /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [headers, ...rows.map(toCells)].map((cells) => cells.map(escape).join(";"));
  return `\uFEFF${lines.join("\r\n")}`;
}

async function toXlsx(rows: StudentRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LFit";
  const sheet = workbook.addWorksheet(t.title);
  sheet.addRow(headers).font = { bold: true };
  rows.forEach((s) => sheet.addRow(toCells(s)));
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
  const { rows } = await listStudents(params, { limit: EXPORT_LIMIT });

  const supabase = await createClient();
  await supabase.rpc("log_students_export", {
    p_format: format,
    p_count: rows.length,
    p_filters: { status: params.status, sort: params.sort, turma: params.turma ?? null, grupo: params.grupo ?? null, busca: Boolean(params.q) },
  });

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const filename = `alunos-${params.status}-${stamp}.${format}`;
  const body = format === "xlsx" ? await toXlsx(rows) : toCsv(rows);

  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type":
        format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
