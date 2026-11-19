"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { isNetworkError } from "@/features/student-app/queue";
import { createClient } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { dbErrorMessage, messages } from "@/messages/pt-BR";
import { IMPORT_DECLARATION_VERSION } from "../declaration";
import { IMPORT_FIELDS, looksLikeHealth, missingRequired, REQUIRED_FIELDS, suggestMapping, type ColumnMapping, type ImportField } from "../fields";
import { checkSheet, decodeText, fileKind, MAX_FILE_BYTES, MAX_ROWS, parseCsv, toSheet, type Encoding, type Sheet } from "../parse";
import {
  batches,
  parseImportResponse,
  rejectedCsv,
  templateCsv,
  validateAll,
  type RowError,
  type ServerRowError,
  type ValidatedRow,
} from "../validate";

const t = messages.importer;

type Step = 0 | 1 | 2 | 3;
type Rejection = { line: number; reason: string };

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const errorText = (e: RowError | ServerRowError) => t.errors[e];

/**
 * Importação em 4 passos: arquivo → colunas → revisão → resultado. O arquivo é lido no navegador e descartado (fica só
 * a tabela em memória enquanto a página está aberta); vão ao banco só as linhas válidas, em lotes de 200, pela RPC
 * `import_students` (as regras do cadastro valem lá). Nada de valor de célula em console.
 */
export function ImportWizard({ role, seatsLeft }: { role: "owner" | "trainer"; seatsLeft: number }) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(0);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [encoding, setEncoding] = useState<Encoding | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [validated, setValidated] = useState<ValidatedRow[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [interrupted, setInterrupted] = useState(false);
  const [created, setCreated] = useState(0);
  const [serverRejected, setServerRejected] = useState<Rejection[]>([]);
  // Lotes ainda não confirmados pelo servidor (para "Tentar de novo" continuar de onde parou) e id da importação.
  const pendingRef = useRef<ValidatedRow[][]>([]);
  const batchIdRef = useRef<string>("");
  const router = useRouter();
  const [declared, setDeclared] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const reset = () => {
    setStep(0);
    setSheet(null);
    setMapping(null);
    setValidated([]);
    setProgress(null);
    setInterrupted(false);
    setCreated(0);
    setServerRejected([]);
    setProblem(null);
    setEncoding(null);
    setDeclared(false);
    setStartError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    const kind = fileKind(file.name);
    if (!kind) return setProblem(t.fileProblems.unsupported);
    if (file.size > MAX_FILE_BYTES) return setProblem(t.fileProblems.too_big);
    setReading(true);
    try {
      const buffer = await file.arrayBuffer();
      let table: string[][];
      if (kind === "csv") {
        const decoded = decodeText(new Uint8Array(buffer));
        setEncoding(decoded.encoding);
        table = parseCsv(decoded.text);
      } else {
        setEncoding(null);
        const { readXlsx } = await import("../xlsx");
        table = await readXlsx(buffer);
      }
      const s = toSheet(table);
      const issue = checkSheet(s);
      if (issue) return setProblem(t.fileProblems[issue]);
      setSheet(s);
      setMapping(suggestMapping(s.headers));
      setStep(1);
    } catch {
      setProblem(t.fileProblems.unreadable);
    } finally {
      setReading(false);
      // O arquivo não fica em lugar nenhum: o input é limpo e só a tabela lida segue no estado da página.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const toReview = () => {
    if (!sheet || !mapping) return;
    setValidated(validateAll(sheet.rows, mapping));
    setStep(2);
  };

  const valid = validated.filter((v) => v.payload);
  const invalid = validated.filter((v) => !v.payload);
  const warned = valid.filter((v) => v.warnings.length);
  const activeToImport = valid.filter((v) => v.payload!.status === "active").length;

  const runBatches = async () => {
    setInterrupted(false);
    const total = valid.length;
    while (pendingRef.current.length) {
      const batch = pendingRef.current[0];
      const sent = batch.map((b) => b.line);
      try {
        const { data, error } = await supabase.rpc("import_students", {
          p_batch_id: batchIdRef.current,
          p_rows: batch.map((b) => b.payload!) as never,
        });
        if (error && isNetworkError(error)) {
          // O supabase-js devolve a queda de rede em `error` (não lança): o lote fica para "Tentar de novo".
          setInterrupted(true);
          return;
        }
        if (error) {
          // Recusa do lote inteiro (sessão expirada, permissão): todas as linhas do lote como falha.
          setServerRejected((r) => [...r, ...sent.map((line) => ({ line, reason: errorText("IMPORT_ROW_FAILED") }))]);
        } else {
          const results = parseImportResponse(data, sent);
          setCreated((c) => c + results.filter((r) => r.ok).length);
          setServerRejected((r) => [...r, ...results.filter((x) => !x.ok).map((x) => ({ line: x.row, reason: errorText(x.error!) }))]);
        }
        pendingRef.current = pendingRef.current.slice(1);
        setProgress((p) => ({ done: (p?.done ?? 0) + batch.length, total }));
      } catch {
        // Sem resposta: o lote fica para "Tentar de novo" (e-mail único impede duplicar quem já entrou).
        setInterrupted(true);
        return;
      }
    }
    setStep(3);
  };

  // Abre o lote (declaração + origem registradas no banco) e só então envia as linhas.
  const startImport = async () => {
    if (!declared) return setStartError(t.declarationRequired);
    setStartError(null);
    setStarting(true);
    try {
      const { data, error } = await supabase.rpc("start_import_batch", {
        p_source_label: sourceLabel.trim() || t.sourceDefault,
        p_declaration_version: IMPORT_DECLARATION_VERSION,
        p_rows_expected: valid.length,
      });
      if (error || !data) return setStartError(error && !isNetworkError(error) ? dbErrorMessage(error) : t.startFailed);
      batchIdRef.current = data;
    } catch {
      return setStartError(t.startFailed);
    } finally {
      setStarting(false);
    }
    pendingRef.current = batches(valid);
    setProgress({ done: 0, total: valid.length });
    await runBatches();
    router.refresh(); // histórico de importações
  };

  const rejections: Rejection[] = [
    ...invalid.map((v) => ({ line: v.line, reason: v.errors.map(errorText).join("; ") })),
    ...serverRejected,
  ].sort((a, b) => a.line - b.line);

  const downloadRejected = () => {
    if (!sheet) return;
    const byLine = new Map(sheet.rows.map((r) => [r.line, r.cells]));
    download(
      "linhas-recusadas.csv",
      rejectedCsv(
        sheet.headers,
        rejections.map((r) => ({ ...r, cells: byLine.get(r.line) ?? [] })),
        { line: t.rejectedLine, reason: t.rejectedReason },
      ),
    );
  };

  const importing = progress !== null && step === 2;

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-2" aria-label={t.title}>
        {t.steps.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-xs ring-1",
              i === step ? "bg-selected-soft font-semibold text-ink ring-selected-line" : "bg-surface text-ink-3 ring-line",
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <p className="text-[13px] text-ink-2">{t.privacy}</p>
          <HealthNotice />
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              id="import-file"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button type="button" disabled={reading} onClick={() => inputRef.current?.click()}>
              {reading ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
              {reading ? t.reading : t.chooseFile}
            </Button>
            <Button type="button" variant="outline" onClick={() => download("modelo-importacao-alunos.csv", templateCsv(t.fields))}>
              <Download aria-hidden />
              {t.template}
            </Button>
          </div>
          <p className="text-xs text-ink-3">
            {t.fileHint(MAX_FILE_BYTES / 1024 / 1024, MAX_ROWS)} {t.templateHint}
          </p>
          {problem && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {problem}
            </p>
          )}
        </section>
      )}

      {step === 1 && sheet && mapping && (
        <section aria-labelledby="map-title" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div>
            <h2 id="map-title" className="text-[15px] font-semibold text-ink">
              {t.mapTitle}
            </h2>
            <p className="text-[13px] text-ink-2">
              <FileSpreadsheet aria-hidden className="mr-1 inline size-4 align-text-bottom" />
              {t.fileInfo(sheet.rows.length, encoding)} {t.mapHint}
            </p>
          </div>
          <HealthNotice />
          <div className="grid gap-3 md:grid-cols-2">
            {IMPORT_FIELDS.map((field) => (
              <MappingField key={field} field={field} sheet={sheet} value={mapping[field]} onChange={(v) => setMapping({ ...mapping, [field]: v })} />
            ))}
          </div>
          {missingRequired(mapping).length > 0 && (
            <p role="alert" className="text-[13px] text-danger-ink">
              {t.missingRequired(missingRequired(mapping).map((f) => t.fields[f]).join(", "))}
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              {t.back}
            </Button>
            <Button type="button" disabled={missingRequired(mapping).length > 0} onClick={toReview}>
              {t.next}
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="review-title" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div>
            <h2 id="review-title" className="text-[15px] font-semibold text-ink">
              {t.reviewTitle}
            </h2>
            <p className="text-[13px] text-ink-2">{t.reviewSummary(valid.length, invalid.length)}</p>
            {warned.length > 0 && <p className="text-[13px] text-ink-2">{t.withWarnings(warned.length)}</p>}
            <p className="text-xs text-ink-3">{role === "owner" ? t.ownerNote : t.trainerNote}</p>
          </div>

          {activeToImport > seatsLeft && (
            <p className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t.planWarning(Math.max(0, seatsLeft))}
            </p>
          )}

          {invalid.length > 0 && (
            <IssueList title={t.problemsTitle} items={invalid.map((v) => ({ line: v.line, text: v.errors.map(errorText).join("; ") }))} />
          )}
          {warned.length > 0 && (
            <IssueList title={t.warningsTitle} items={warned.map((v) => ({ line: v.line, text: v.warnings.map((w) => t.warnings[w]).join("; ") }))} />
          )}

          {importing && progress && (
            <div className="flex flex-col gap-1.5" role="status">
              <p className="text-[13px] text-ink-2">{t.importing(progress.done, progress.total)}</p>
              <ProgressBar value={progress.done} max={progress.total} label={t.importing(progress.done, progress.total)} />
            </div>
          )}
          {interrupted && (
            <p role="alert" className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">
              {t.interrupted}
            </p>
          )}

          {!importing && valid.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <label htmlFor="import-source" className="flex flex-col gap-1 text-[13px] font-medium text-ink">
                {t.sourceLabel}
                <input
                  id="import-source"
                  type="text"
                  maxLength={60}
                  value={sourceLabel}
                  placeholder={t.sourcePlaceholder}
                  onChange={(e) => setSourceLabel(e.target.value)}
                  className="h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-[16px] font-normal text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[14px]"
                />
              </label>
              <p className="text-xs text-ink-3">{t.preRegistration}</p>
              <label htmlFor="import-declaration" className="flex items-start gap-2.5 text-[13px] text-ink">
                <Checkbox id="import-declaration" className="mt-0.5" checked={declared} onCheckedChange={(v) => setDeclared(v === true)} />
                <span>{t.declaration}</span>
              </label>
              {startError && (
                <p role="alert" className="text-[13px] text-danger-ink">
                  {startError}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" disabled={importing} onClick={() => setStep(1)}>
              {t.back}
            </Button>
            {interrupted ? (
              <Button
                type="button"
                onClick={async () => {
                  await runBatches();
                  router.refresh();
                }}
              >
                {t.retry}
              </Button>
            ) : (
              <Button type="button" disabled={valid.length === 0 || importing || starting || !declared} onClick={() => void startImport()}>
                {(importing || starting) && <Loader2 aria-hidden className="animate-spin" />}
                {t.importButton(valid.length)}
              </Button>
            )}
          </div>
        </section>
      )}

      {step === 3 && (
        <section aria-labelledby="result-title" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h2 id="result-title" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <CheckCircle2 aria-hidden className="size-5 text-success-ink" />
            {t.resultTitle}
          </h2>
          <p role="status" className="text-[13px] text-ink-2">
            {t.resultSummary(created, rejections.length)}
          </p>
          {rejections.length > 0 && <IssueList title={t.problemsTitle} items={rejections.map((r) => ({ line: r.line, text: r.reason }))} />}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/alunos">{t.goToStudents}</Link>
            </Button>
            {rejections.length > 0 && (
              <Button type="button" variant="outline" onClick={downloadRejected}>
                <Download aria-hidden />
                {t.downloadRejected}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={reset}>
              {t.another}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function MappingField({
  field,
  sheet,
  value,
  onChange,
}: {
  field: ImportField;
  sheet: Sheet;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const id = `map-${field}`;
  const sample = value === null ? "" : (sheet.rows.find((r) => r.cells[value])?.cells[value] ?? "");
  const hint = (t.fieldHints as Partial<Record<ImportField, string>>)[field];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {t.fields[field]}
        {REQUIRED_FIELDS.includes(field) && <span className="font-normal text-ink-3"> ({t.required})</span>}
      </label>
      <select
        id={id}
        value={value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-2 text-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">{t.notImported}</option>
        {sheet.headers.map((h, i) => (
          <option key={i} value={i}>
            {looksLikeHealth(h) ? t.healthColumn(h) : h}
          </option>
        ))}
      </select>
      {sample && <p className="truncate text-xs text-ink-3">{t.example(sample)}</p>}
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

/** Aviso fixo (passos 1 e 2): saúde não entra pela importação. */
function HealthNotice() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      {t.healthWarning}
    </p>
  );
}

const SHOWN = 50;

function IssueList({ title, items }: { title: string; items: { line: number; text: string }[] }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[13px] font-semibold text-ink">{title}</h3>
      <ul className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line text-[13px]">
        {items.slice(0, SHOWN).map((it, i) => (
          <li key={`${it.line}-${i}`} className="flex gap-3 px-3 py-1.5">
            <span className="tabular w-16 shrink-0 text-ink-3">{t.line(it.line)}</span>
            <span className="min-w-0 text-ink-2">{it.text}</span>
          </li>
        ))}
      </ul>
      {items.length > SHOWN && <p className="mt-1 text-xs text-ink-3">{t.moreRows(items.length - SHOWN)}</p>}
    </div>
  );
}
