/**
 * Apagar post do feed — ordem e confirmações (lógica pura, dependências injetadas para testar as falhas).
 * "Post apagado" só sai daqui quando (1) o banco confirmou o apagamento E (2) o arquivo da imagem, se havia, saiu do
 * Storage. Qualquer falha depois do apagamento no banco DESFAZ o apagamento (o post volta como estava) e devolve erro:
 * a tela mostra o erro e o post continua na lista.
 */
export type DeleteStep = "rpc" | "confirm" | "storage" | "restore";
export type DeleteResult = { ok: true } | { ok: false; step: DeleteStep; error?: unknown };

export interface DeleteDeps {
  /** RPC com a sessão do usuário (autoriza e faz o soft delete). Devolve o caminho da imagem a remover, se houver. */
  softDelete: () => Promise<{ imagePath: string | null; error?: unknown }>;
  /** Lê de novo (secret key) se o post está marcado como apagado. */
  isDeleted: () => Promise<boolean>;
  /** Remove o arquivo pela API do Storage (secret key); devolve erro se a API recusar. */
  removeFile: (path: string) => Promise<{ error?: unknown }>;
  /** Confere que o arquivo não existe mais no bucket. */
  fileExists: (path: string) => Promise<boolean>;
  /** Desfaz o soft delete (estado anterior do post). */
  restore: () => Promise<{ error?: unknown }>;
}

export async function runFeedDelete(deps: DeleteDeps): Promise<DeleteResult> {
  const r = await deps.softDelete();
  if (r.error) return { ok: false, step: "rpc", error: r.error };

  const undo = async (step: DeleteStep, error?: unknown): Promise<DeleteResult> => {
    const back = await deps.restore().catch((e: unknown) => ({ error: e }));
    return back.error ? { ok: false, step: "restore", error: back.error } : { ok: false, step, error };
  };

  if (!(await deps.isDeleted().catch(() => false))) return undo("confirm");
  if (r.imagePath) {
    const removed = await deps.removeFile(r.imagePath).catch((e: unknown) => ({ error: e }));
    if (removed.error) return undo("storage", removed.error);
    if (await deps.fileExists(r.imagePath).catch(() => true)) return undo("storage");
  }
  return { ok: true };
}
