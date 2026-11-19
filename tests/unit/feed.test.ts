import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FEED_VIDEO_RE,
  classifyVideo,
  feedImagePath,
  feedPostSchema,
  fitWithin,
  isNewForStudent,
  isScheduled,
  isoToSpLocal,
  linkify,
  parseMyFeed,
  parseStaffFeed,
  pickFeedMediaToRemove,
  safeHref,
  sanitizeFeedText,
  spLocalToISO,
  toFeedPayload,
  type FeedPostForm,
} from "@/features/feed/feed";
import { navigation } from "@/data/navigation";
import { messages } from "@/messages/pt-BR";

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/20261119160000_feed.sql"), "utf8");

describe("texto puro e links", () => {
  it("tira HTML (inclusive tag aberta no fim) e normaliza quebras", () => {
    expect(sanitizeFeedText("  <b>Oi</b>\r\n<script>alert(1)</script>tudo bem?<img src=x onerror=1  ")).toBe("Oi\nalert(1)tudo bem?");
    expect(sanitizeFeedText("2 < 3 e 5 > 4")).toBe("2 < 3 e 5 > 4");
    expect(sanitizeFeedText("<<b>x")).toBe("x");
  });
  it("o texto saneado passa no CHECK do banco (sem '<' seguido de letra, /, ! ou ?)", () => {
    for (const s of ["<a href='javascript:x'>oi</a>", "<!-- c -->", "</p>", "<?xml?>", "<<script>"]) {
      expect(sanitizeFeedText(s)).not.toMatch(/<[A-Za-z/!?]/);
    }
    expect(SQL).toContain("body !~ '<[A-Za-z/!?]'");
  });
  it("só http/https viram link; javascript:, data: e vbscript: ficam como texto", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("vbscript:x")).toBeNull();
    expect(safeHref("https://exemplo.com/a")).toBe("https://exemplo.com/a");
    const parts = linkify("Veja https://exemplo.com/treino. E javascript:alert(1) não.");
    expect(parts).toEqual([
      { type: "text", value: "Veja " },
      { type: "link", value: "https://exemplo.com/treino", href: "https://exemplo.com/treino" },
      { type: "text", value: ". E javascript:alert(1) não." },
    ]);
  });
});

describe("vídeo por link", () => {
  it("YouTube/Vimeo viram embed (youtube-nocookie, Vimeo dnt); Instagram vira cartão", () => {
    expect(classifyVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({ provider: "youtube", embed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" });
    expect(classifyVideo("https://youtu.be/dQw4w9WgXcQ")?.embed).toContain("youtube-nocookie");
    expect(classifyVideo("https://vimeo.com/123456789")).toMatchObject({ provider: "vimeo", embed: "https://player.vimeo.com/video/123456789?dnt=1" });
    expect(classifyVideo("https://www.instagram.com/reel/abc123/")).toMatchObject({ provider: "instagram", embed: null });
  });
  it("recusa http, outros sites, javascript:, espaços e aspas", () => {
    for (const u of [
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://evil.com/youtube.com/",
      "https://youtube.com.evil.com/x",
      "javascript:alert(1)//https://youtube.com/",
      "https://www.youtube.com/watch?v=a b",
      "https://www.youtube.com/\"><script>",
      "https://tiktok.com/@x",
    ]) {
      expect(classifyVideo(u), u).toBeNull();
    }
  });
  it("o padrão do código é o mesmo do CHECK do banco", () => {
    const sqlRe = FEED_VIDEO_RE.source.replace(/\\\//g, "/").replace(/'/g, "''");
    expect(SQL).toContain(`'${sqlRe}'`);
  });
});

describe("formulário do editor", () => {
  const base: FeedPostForm = { kind: "text", body: "Dica", imagePath: null, videoUrl: "", audience: "all", modality: null, classId: null, pinned: false, publishAt: null };
  it("texto exige corpo; imagem exige arquivo; vídeo exige link válido", () => {
    expect(feedPostSchema.safeParse(base).success).toBe(true);
    expect(feedPostSchema.safeParse({ ...base, body: "<b></b>  " }).success).toBe(false);
    expect(feedPostSchema.safeParse({ ...base, kind: "image", body: "" }).success).toBe(false);
    expect(feedPostSchema.safeParse({ ...base, kind: "image", body: "", imagePath: "org/x.webp" }).success).toBe(true);
    expect(feedPostSchema.safeParse({ ...base, kind: "video", videoUrl: "https://evil.com/x" }).success).toBe(false);
    expect(feedPostSchema.safeParse({ ...base, body: "x".repeat(2001) }).success).toBe(false);
  });
  it("público: modalidade e turma exigem a escolha", () => {
    expect(feedPostSchema.safeParse({ ...base, audience: "modality" }).success).toBe(false);
    expect(feedPostSchema.safeParse({ ...base, audience: "modality", modality: "presencial" }).success).toBe(true);
    expect(feedPostSchema.safeParse({ ...base, audience: "class" }).success).toBe(false);
  });
  it("payload: texto saneado, campos de outro tipo vazios", () => {
    const p = toFeedPayload({ ...base, kind: "video", body: "<i>olha</i>", videoUrl: " https://youtu.be/dQw4w9WgXcQ ", imagePath: "sobrou", audience: "modality", modality: "hibrido", classId: "sobrou" });
    expect(p).toEqual({
      kind: "video", body: "olha", image_path: null, video_url: "https://youtu.be/dQw4w9WgXcQ",
      audience: "modality", audience_modality: "hibrido", audience_class_id: null, pinned: false, published_at: null,
    });
  });
});

describe("agendamento, novidades e imagem", () => {
  it("data e hora do campo valem no horário de São Paulo", () => {
    expect(spLocalToISO("2026-11-20T08:00")).toBe("2026-11-20T11:00:00.000Z");
    expect(isoToSpLocal("2026-11-20T11:00:00.000Z")).toBe("2026-11-20T08:00");
    expect(spLocalToISO("20/11/2026 08:00")).toBeNull();
  });
  it("agendado e novo", () => {
    const now = new Date("2026-11-19T12:00:00Z");
    expect(isScheduled("2026-11-19T12:00:01Z", now)).toBe(true);
    expect(isScheduled("2026-11-19T11:59:59Z", now)).toBe(false);
    expect(isNewForStudent("2026-11-19T12:00:00Z", null)).toBe(false); // primeira visita: nada marcado
    expect(isNewForStudent("2026-11-19T12:00:00Z", "2026-11-19T11:00:00Z")).toBe(true);
    expect(isNewForStudent("2026-11-19T10:00:00Z", "2026-11-19T11:00:00Z")).toBe(false);
  });
  it("redimensiona o lado maior para 1600 sem aumentar; caminho na pasta da organização", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(feedImagePath("org", "abc", "image/webp")).toBe("org/abc.webp");
    expect(feedImagePath("org", "abc", "image/jpeg")).toBe("org/abc.jpg");
  });
});

describe("limpeza diária do bucket", () => {
  const now = new Date("2026-11-20T12:00:00Z").getTime();
  const h = (n: number) => new Date(now - n * 3_600_000).toISOString();
  const files = [
    { path: "o/active.webp", createdAt: h(100) },
    { path: "o/scheduled.webp", createdAt: h(100) },
    { path: "o/deleted.webp", createdAt: h(1) },
    { path: "o/shared.webp", createdAt: h(100) },
    { path: "o/orphan-old.webp", createdAt: h(25) },
    { path: "o/orphan-new.webp", createdAt: h(23) },
    { path: "o/no-date.webp", createdAt: null },
  ];
  const usage = [
    { path: "o/active.webp", deleted: false },
    { path: "o/scheduled.webp", deleted: false },
    { path: "o/deleted.webp", deleted: true },
    { path: "o/shared.webp", deleted: true },
    { path: "o/shared.webp", deleted: false },
  ];
  it("remove imagem de post apagado (qualquer idade) e órfã com mais de 24 h; nunca a de post ativo", () => {
    expect(pickFeedMediaToRemove(files, usage, now).sort()).toEqual(["o/deleted.webp", "o/orphan-old.webp"]);
  });
  it("órfã recente e sem data ficam", () => {
    const out = pickFeedMediaToRemove(files, usage, now);
    expect(out).not.toContain("o/orphan-new.webp");
    expect(out).not.toContain("o/no-date.webp");
  });
  it("vercel.json agenda a rota 1×/dia e a rota exige o segredo", () => {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    const cron = cfg.crons.find((c) => c.path === "/api/cron/feed-media");
    expect(cron?.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
    const route = readFileSync(join(process.cwd(), "app/api/cron/feed-media/route.ts"), "utf8");
    expect(route).toContain("CRON_SECRET");
    expect(route).toMatch(/status: 401/);
  });
});

describe("leitura das RPCs", () => {
  it("aluno: só contagem e o próprio estado — campos de quem curtiu são ignorados", () => {
    const f = parseMyFeed({
      last_seen_at: "2026-11-19T10:00:00Z",
      posts: [{ id: "1", kind: "text", body: "oi", pinned: true, published_at: "x", like_count: 3, liked: true, likers: ["Ana"] }, { nope: 1 }],
    });
    expect(f.lastSeenAt).toBe("2026-11-19T10:00:00Z");
    expect(f.posts).toHaveLength(1);
    expect(f.posts[0]).toMatchObject({ likeCount: 3, liked: true, pinned: true });
    expect(JSON.stringify(f)).not.toContain("Ana");
  });
  it("personal: público e permissões", () => {
    const [p] = parseStaffFeed([{ id: "1", kind: "image", image_path: "o/a.webp", audience: "class", audience_class_name: "Turma A", can_edit: true, like_count: 2 }]);
    expect(p).toMatchObject({ kind: "image", imagePath: "o/a.webp", audience: "class", audienceClassName: "Turma A", canEdit: true, likeCount: 2 });
    expect(parseStaffFeed(null)).toEqual([]);
  });
});

describe("app do aluno: nome do personal (sem 'coordenação/equipe do estúdio')", () => {
  it("quem vê a conversa", () => {
    expect(messages.chat.visibility("Caio", "Rafael")).toBe("Sua conversa é vista por Caio e por Rafael");
    expect(messages.chat.visibility(null, "Rafael")).toBe("Sua conversa é vista por Rafael");
    expect(messages.chat.visibility("Rafael", "Rafael")).toBe("Sua conversa é vista por Rafael");
    expect(messages.chat.visibility(null, null)).toBe("Sua conversa é vista pelo seu personal");
  });
  it("perfil, Hoje e NPS sem nome usam 'seu personal'", () => {
    expect(messages.aluno.profile.noTrainer("Rafael")).toBe("Rafael acompanha você.");
    expect(messages.aluno.profile.noTrainer(null)).toBe("Seu personal acompanha você.");
    expect(messages.aluno.today.noTrainer).toBe("Seu personal");
    expect(messages.nps.prompt.title(null)).toBe("Como está sendo treinar com seu personal?");
  });
  it("nenhum texto do app fala em 'coordenação do estúdio' ou 'equipe do estúdio'", () => {
    const src = readFileSync(join(process.cwd(), "messages/pt-BR.ts"), "utf8");
    // ("Crie a conta do seu estúdio ou consultoria." é o cadastro do próprio personal, fora do app do aluno.)
    expect(src).not.toMatch(/coordenação do estúdio|equipe do estúdio|"Seu estúdio"/i);
  });
});

describe("textos e menu", () => {
  it("aviso fixo do editor", () => {
    expect(messages.feed.warning).toBe("Não publique dados de saúde nem fotos de alunos sem autorização deles.");
  });
  it("'Feed' disponível no menu do painel", () => {
    const item = navigation.flatMap((s) => s.items).find((i) => i.href === "/feed");
    expect(item?.status).toBe("available");
  });
  it("migration: bucket privado de 5 MB, só JPEG/WebP; nada de vídeo enviado", () => {
    expect(SQL).toMatch(/values \('feed-media', 'feed-media', false, 5 \* 1024 \* 1024, array\['image\/jpeg', 'image\/webp'\]\)/);
    expect(SQL).not.toMatch(/video\/mp4|video\/webm/);
  });
});
