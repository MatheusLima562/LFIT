type CryptoLike = Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string };

/**
 * UUID v4 que funciona também fora de contexto seguro: `crypto.randomUUID` só existe em HTTPS/localhost (no celular
 * pelo IP da rede, em http, ele não existe), mas `crypto.getRandomValues` existe em qualquer contexto.
 */
export function uuidV4(c: CryptoLike = globalThis.crypto): string {
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // versão 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
