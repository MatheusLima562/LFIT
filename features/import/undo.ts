/** Prazo do "Desfazer" da importação (o banco confere de novo em `undo_import_batch`). Lógica pura. */
export const UNDO_DAYS = 7;

export function undoDeadline(createdAt: string): string {
  return new Date(Date.parse(createdAt) + UNDO_DAYS * 86_400_000).toISOString();
}

export function canUndo(b: { createdAt: string; undoneAt: string | null; created: number }, nowMs: number): boolean {
  return b.undoneAt === null && b.created > 0 && nowMs < Date.parse(undoDeadline(b.createdAt));
}
