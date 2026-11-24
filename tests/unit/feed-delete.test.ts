import { describe, expect, it, vi } from "vitest";
import { runFeedDelete, type DeleteDeps } from "@/features/feed/delete-flow";

/** Apagar post: "Post apagado" só com o banco confirmando E a imagem fora do Storage; senão desfaz e devolve erro. */
function deps(over: Partial<DeleteDeps> = {}): DeleteDeps & { calls: string[] } {
  const calls: string[] = [];
  const d: DeleteDeps = {
    softDelete: vi.fn(async () => (calls.push("rpc"), { imagePath: "org/img.webp" })),
    isDeleted: vi.fn(async () => (calls.push("confirm"), true)),
    removeFile: vi.fn(async () => (calls.push("remove"), {})),
    fileExists: vi.fn(async () => (calls.push("exists"), false)),
    restore: vi.fn(async () => (calls.push("restore"), {})),
    ...over,
  };
  return Object.assign(d, { calls });
}

describe("apagar post do feed", () => {
  it("sucesso só depois de confirmar no banco, remover o arquivo e conferir que saiu", async () => {
    const d = deps();
    expect(await runFeedDelete(d)).toEqual({ ok: true });
    expect(d.calls).toEqual(["rpc", "confirm", "remove", "exists"]);
    expect(d.restore).not.toHaveBeenCalled();
  });

  it("sem imagem (ou imagem usada por outro post): não mexe no Storage", async () => {
    const d = deps({ softDelete: async () => ({ imagePath: null }) });
    expect(await runFeedDelete(d)).toEqual({ ok: true });
    expect(d.removeFile).not.toHaveBeenCalled();
  });

  it("RPC recusada: erro, nada mais acontece", async () => {
    const d = deps({ softDelete: async () => ({ imagePath: null, error: { message: "FORBIDDEN" } }) });
    expect(await runFeedDelete(d)).toMatchObject({ ok: false, step: "rpc" });
    expect(d.isDeleted).not.toHaveBeenCalled();
    expect(d.restore).not.toHaveBeenCalled();
  });

  it("banco não confirma o apagamento: desfaz e devolve erro", async () => {
    const d = deps({ isDeleted: async () => false });
    expect(await runFeedDelete(d)).toMatchObject({ ok: false, step: "confirm" });
    expect(d.restore).toHaveBeenCalledOnce();
    expect(d.removeFile).not.toHaveBeenCalled();
  });

  it("Storage recusa a remoção (erro devolvido, sem exceção): desfaz e devolve erro", async () => {
    const d = deps({ removeFile: async () => ({ error: new Error("503") }) });
    expect(await runFeedDelete(d)).toMatchObject({ ok: false, step: "storage" });
    expect(d.restore).toHaveBeenCalledOnce();
  });

  it("Storage lança exceção (rede): desfaz e devolve erro", async () => {
    const d = deps({ removeFile: async () => { throw new Error("fetch failed"); } });
    expect(await runFeedDelete(d)).toMatchObject({ ok: false, step: "storage" });
    expect(d.restore).toHaveBeenCalledOnce();
  });

  it("arquivo continua no bucket (ou não dá para conferir): desfaz e devolve erro", async () => {
    for (const fileExists of [async () => true, async () => { throw new Error("list"); }]) {
      const d = deps({ fileExists });
      expect(await runFeedDelete(d)).toMatchObject({ ok: false, step: "storage" });
      expect(d.restore).toHaveBeenCalledOnce();
    }
  });

  it("falha ao desfazer também é erro (nunca 'apagado')", async () => {
    const d = deps({ removeFile: async () => ({ error: "x" }), restore: async () => ({ error: "y" }) });
    expect(await runFeedDelete(d)).toMatchObject({ ok: false, step: "restore" });
  });
});
