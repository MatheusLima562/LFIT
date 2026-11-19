/**
 * Preparação de dados por roteiro (A4 do sprint do feed): cada roteiro devolve ao estado do seed SÓ o que ele usa, no
 * começo, para passar sozinho e em qualquer ordem sem refazer o seed inteiro (`--no-reseed`). Só no lfit-dev: o
 * `_guard.mjs` (importado antes) já recusa outro projeto, e o SQL direto confere de novo o projeto vinculado ao CLI.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LFIT_DEV_PROJECT_REF } from "../scripts/dev-guard.mts";

const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

/** Ids fixos do seed usados pelos roteiros do app do aluno (Camila = aluno.seed, professor responsável = Caio). */
export async function seedIds(admin) {
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const id = (email) => users.users.find((x) => x.email === email)?.id;
  const camila = must(await admin.from("students").select("id, organization_id").eq("user_id", id("aluno.seed@example.com")).single(), "Camila do seed");
  return { camila: camila.id, org: camila.organization_id, caio: id("trainer2.seed@example.com"), owner: id("owner.seed@example.com") };
}

/**
 * Chat da Camila no estado do seed (`seedChat` em scripts/seed.mts): as 3 mensagens de ontem, a Camila leu tudo, Caio e
 * owner sem cursor (as 2 mensagens da aluna não lidas). Apaga o que outros roteiros deixaram na conversa (mensagens e
 * cursores de leitura) — é o que fazia o k212 falhar depois do AO VIVO (o Caio abria a conversa e o cursor dele andava).
 */
export async function resetCamilaChat(admin) {
  const { camila, org, caio } = await seedIds(admin);
  must(await admin.from("chat_messages").delete().eq("student_id", camila), "apagar conversa");
  must(await admin.from("chat_reads").delete().eq("student_id", camila), "apagar cursores");
  const yesterday = Date.now() - 86_400_000;
  const rows = [
    ["student", null, "Oi, Caio! Posso trocar o treino de terça para quarta esta semana?"],
    ["staff", caio, "Pode sim, Camila. Só mantenha um dia de descanso entre o A e o B."],
    ["student", null, "Combinado, obrigada!"],
  ].map(([sender_role, sender_id, body], i) => ({
    organization_id: org, student_id: camila, sender_role, sender_id, body, client_msg_id: randomUUID(),
    created_at: new Date(yesterday + i * 7 * 60_000).toISOString(),
  }));
  const inserted = must(await admin.from("chat_messages").insert(rows).select("id, created_at").order("created_at"), "mensagens do seed");
  const last = inserted.at(-1);
  must(
    await admin.from("chat_reads").insert({ student_id: camila, reader_role: "student", reader_id: camila, last_read_at: last.created_at, last_read_message_id: last.id }),
    "aluna leu tudo",
  );
}

/** Projeto vinculado ao CLI; o SQL direto só roda se for o lfit-dev (mesma trava de tests/db/live.test.ts). */
function sqlLinkedDev(sql) {
  let ref = "";
  try {
    ref = readFileSync(join(process.cwd(), "supabase", ".temp", "project-ref"), "utf8").trim();
  } catch {}
  if (ref !== LFIT_DEV_PROJECT_REF) throw new Error(`Projeto vinculado não é o lfit-dev; recebido "${ref || "nenhum"}". Nada foi executado.`);
  execFileSync(join(process.cwd(), "node_modules", ".bin", "supabase"), ["db", "query", "--linked", sql], {
    encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL",
  });
}

/**
 * Aviso de transparência do AO VIVO ainda não visto (`private.live_notice_acks` fica fora da API; por isso o SQL
 * direto). Sem isso, o AO VIVO só mostrava o aviso na primeira execução depois do seed.
 */
export function resetLiveNotice(studentId) {
  if (!/^[0-9a-f-]{36}$/.test(studentId)) throw new Error("id inválido");
  sqlLinkedDev(`delete from private.live_notice_acks where student_id = '${studentId}';`);
}
