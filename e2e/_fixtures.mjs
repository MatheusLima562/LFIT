/**
 * Preparação de dados por roteiro (A4 do sprint do feed): cada roteiro devolve ao estado do seed SÓ o que ele usa, no
 * começo, para passar sozinho e em qualquer ordem sem refazer o seed inteiro (`--no-reseed`). Só no lfit-dev: o
 * `_guard.mjs` (importado antes) já recusa outro projeto, e o SQL direto confere de novo o projeto vinculado ao CLI.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
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

/**
 * Camila sem nenhum treino (estado do seed padrão): o f3 conta "nenhum treino no mês", 2 concluídos + 1 em andamento no
 * histórico e 1 "ainda incomoda". Apaga as sessões dela (registros, ao vivo e conversa com a IA vão em cascata).
 */
export async function resetCamilaSessions(admin) {
  const { camila } = await seedIds(admin);
  must(await admin.from("workout_sessions").delete().eq("student_id", camila), "apagar treinos da Camila");
}

/** Diego (aluno.consentimento.seed) com o consentimento de saúde só DECLARADO, ainda não confirmado (estado do seed). */
export async function resetDiegoConsent(admin) {
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const id = users.users.find((x) => x.email === "aluno.consentimento.seed@example.com")?.id;
  must(await admin.from("students").update({ health_data_consent_at: null }).eq("user_id", id), "consentimento pendente do Diego");
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

/** PNG RGB válido gerado na hora (o navegador decodifica, redimensiona e gera WebP/JPEG nos envios de imagem). */
export function makePng(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = 240; raw[i + 1] = (x * 4) & 255; raw[i + 2] = (y * 5) & 255; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Põe (ou tira) um usuário na lista da plataforma — `private.platform_admins` só muda por SQL (sem tela, sem RPC). */
export function setPlatformAdmin(userId, on = true) {
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error("id inválido");
  sqlLinkedDev(on
    ? `insert into private.platform_admins (user_id) values ('${userId}') on conflict do nothing;`
    : `delete from private.platform_admins where user_id = '${userId}';`);
}

/** Situação da assinatura da org do seed (padrão: em dia), opcionalmente "mudada há N dias" (para passar da tolerância). */
export async function setSeedSubscription(admin, status = "active", changedDaysAgo = 0) {
  const { org } = await seedIds(admin);
  must(
    await admin.from("organizations").update({ subscription_status: status, status_changed_at: new Date(Date.now() - changedDaysAgo * 86_400_000).toISOString() }).eq("id", org),
    "situação da assinatura do seed",
  );
}

/**
 * Aviso de transparência do AO VIVO ainda não visto (`private.live_notice_acks` fica fora da API; por isso o SQL
 * direto). Sem isso, o AO VIVO só mostrava o aviso na primeira execução depois do seed.
 */
export function resetLiveNotice(studentId) {
  if (!/^[0-9a-f-]{36}$/.test(studentId)) throw new Error("id inválido");
  sqlLinkedDev(`delete from private.live_notice_acks where student_id = '${studentId}';`);
}
