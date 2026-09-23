/** Remove acentos (NFD + marcas combinantes U+0300–U+036F). */
export function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Normaliza para busca: sem acento e minúsculo. */
export function searchKey(value: string) {
  return stripAccents(value).toLowerCase();
}

/** Slug ASCII (a-z, 0-9 e hífens). */
export function slugify(value: string, maxLength = 40) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}
