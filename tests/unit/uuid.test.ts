import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { uuidV4 } from "@/lib/uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Como o navegador em http fora de localhost (ex.: iPhone pelo IP da rede): sem randomUUID. */
const insecure = { getRandomValues: <T extends ArrayBufferView | null>(a: T) => webcrypto.getRandomValues(a as never) as T };

describe("uuidV4", () => {
  it("usa crypto.randomUUID quando existe", () => {
    const c = { getRandomValues: insecure.getRandomValues, randomUUID: () => "00000000-0000-4000-8000-000000000000" as const };
    expect(uuidV4(c)).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("sem randomUUID (contexto inseguro), gera v4 válido com getRandomValues", () => {
    for (let i = 0; i < 200; i++) expect(uuidV4(insecure)).toMatch(V4);
  });

  it("fallback não repete", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => uuidV4(insecure)));
    expect(ids.size).toBe(5000);
  });

  it("fallback marca versão 4 e variante RFC 4122 mesmo com bytes extremos", () => {
    expect(uuidV4({ getRandomValues: <T,>(a: T) => ((a as Uint8Array).fill(0xff), a) })).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(uuidV4({ getRandomValues: <T,>(a: T) => ((a as Uint8Array).fill(0x00), a) })).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("padrão (global) também é v4", () => expect(uuidV4()).toMatch(V4));
});
