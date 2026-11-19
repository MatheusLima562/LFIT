/**
 * Declaração obrigatória antes de gravar a importação. O TEXTO fica em messages/pt-BR.ts (`importer.declaration`);
 * a VERSÃO precisa existir em `private.import_declarations` (migration 20261119130000) — o banco recusa outra.
 * Mudou o texto? Nova versão aqui + linha nova numa migration (e aposente a antiga com `retired_at`).
 * tests/unit/import.test.ts confere que esta versão está na migration.
 */
export const IMPORT_DECLARATION_VERSION = "2026-11-19.1";
