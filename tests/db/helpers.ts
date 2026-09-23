/**
 * Fixtures para testes de banco contra o projeto Supabase de DESENVOLVIMENTO.
 *
 * Cada suíte cria organizações e usuários descartáveis (prefixo "lfit-test")
 * e remove tudo no final. Usuários fazem login de verdade (JWT), então as
 * políticas RLS são exercitadas exatamente como no app.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SECRET_KEY;

export const dbTestsEnabled = Boolean(url && anonKey && serviceKey && process.env.ALLOW_DB_TESTS === "true");

if (!dbTestsEnabled) {
  console.warn(
    "[tests/db] Pulando testes de banco: defina NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY e ALLOW_DB_TESTS=true " +
      "em .env.local (apenas em projeto de desenvolvimento).",
  );
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin = (): SupabaseClient => createClient(url!, serviceKey!, noSession);
export const anon = (): SupabaseClient => createClient(url!, anonKey!, noSession);

export type Role = "owner" | "trainer" | "student";

export interface TestUser {
  id: string;
  email: string;
  role: Role;
  client: SupabaseClient;
}

export interface TestOrg {
  id: string;
  users: TestUser[];
}

/** Rastreia tudo que foi criado para limpar no afterAll. */
export class Fixture {
  private readonly tag = `lfit-test-${randomUUID().slice(0, 8)}`;
  private readonly orgIds: string[] = [];
  private readonly userIds: string[] = [];
  private client?: SupabaseClient;

  /** Cliente service_role (criado sob demanda para a coleta funcionar sem env). */
  get db() {
    return (this.client ??= admin());
  }

  async org(label: string, studentLimit = 50): Promise<TestOrg> {
    const { data, error } = await this.db
      .from("organizations")
      .insert({ name: `${this.tag} ${label}`, slug: `${this.tag}-${label}`.toLowerCase(), student_limit: studentLimit })
      .select("id")
      .single();
    if (error) throw error;
    this.orgIds.push(data.id);
    return { id: data.id, users: [] };
  }

  async user(org: TestOrg, role: Role, label: string = role): Promise<TestUser> {
    const email = `${this.tag}+${label}-${randomUUID().slice(0, 6)}@example.com`;
    const password = `Senha-${randomUUID()}`;

    const created = await this.db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    const id = created.data.user.id;
    this.userIds.push(id);

    const profile = await this.db
      .from("profiles")
      .insert({ id, organization_id: org.id, role, full_name: `Teste ${label}` });
    if (profile.error) throw profile.error;

    const client = anon();
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;

    const user = { id, email, role, client };
    org.users.push(user);
    return user;
  }

  async group(org: TestOrg, name: string): Promise<string> {
    const { data, error } = await this.db
      .from("special_groups")
      .insert({ organization_id: org.id, name })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async cleanup() {
    if (this.orgIds.length) await this.db.from("organizations").delete().in("id", this.orgIds);
    for (const id of this.userIds) await this.db.auth.admin.deleteUser(id);
  }
}

let counter = 0;
/** Dados mínimos válidos de aluno. */
export function studentData(extra: Record<string, unknown> = {}) {
  counter += 1;
  return {
    first_name: "Aluno",
    last_name: `Teste ${counter}`,
    email: `aluno${counter}-${randomUUID().slice(0, 6)}@example.com`,
    ...extra,
  };
}

/** Chama uma RPC e devolve `data`, lançando o erro do PostgREST se houver. */
export async function rpc<T = unknown>(client: SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message), error);
  return data as T;
}

/** Data civil em São Paulo, n dias atrás (yyyy-mm-dd). */
export function spDateDaysAgo(n: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
