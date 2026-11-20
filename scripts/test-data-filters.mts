/**
 * Quem é dado de TESTE no lfit-dev (lógica pura, testada em tests/unit/test-data-filters.test.ts).
 * - Usuários: e-mail `lfit-test-…@example.com` (fixtures de tests/db e roteiros e2e). Nunca os do seed (`*.seed@example.com`)
 *   nem qualquer domínio real.
 * - Organizações: nome começando por `lfit-test-` (fixtures de tests/db), nunca a do seed (`is_seed`).
 */
export function isTestUserEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return e.startsWith("lfit-test-") && e.endsWith("@example.com") && !e.includes(".seed@");
}

export function isTestOrg(org: { name: string; is_seed: boolean }): boolean {
  return !org.is_seed && org.name.startsWith("lfit-test-");
}
