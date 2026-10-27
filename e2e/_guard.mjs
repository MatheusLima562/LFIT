/**
 * Importado no topo de todo roteiro e2e. Roteiros fazem login com os usuários FICTÍCIOS do seed
 * (owner.seed@example.com…; senha em SEED_USER_PASSWORD, no .env.local) e criam/alteram dados:
 * só rodam no lfit-dev (mesma trava do seed). Nunca coloque credenciais reais aqui.
 */
import { mkdirSync } from "node:fs";
import { assertDevProject } from "../scripts/dev-guard.mts";

assertDevProject(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (!process.env.SEED_USER_PASSWORD) {
  console.error("Defina SEED_USER_PASSWORD (a mesma usada pelo npm run db:seed).");
  process.exit(1);
}
process.env.OUT ??= "e2e/.output";
mkdirSync(process.env.OUT, { recursive: true });
