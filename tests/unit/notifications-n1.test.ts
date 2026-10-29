import { describe, expect, it } from "vitest";
import { announcementNotice, shouldToastNewMessage } from "@/features/notifications/n1";

describe("shouldToastNewMessage", () => {
  it("avisa quando a contagem sobe fora da conversa", () => {
    expect(shouldToastNewMessage(0, 1, false)).toBe(true);
    expect(shouldToastNewMessage(2, 3, false)).toBe(true);
  });
  it("não avisa dentro da conversa, nem quando cai ou fica igual", () => {
    expect(shouldToastNewMessage(0, 1, true)).toBe(false);
    expect(shouldToastNewMessage(3, 0, false)).toBe(false);
    expect(shouldToastNewMessage(1, 1, false)).toBe(false);
  });
});

describe("announcementNotice", () => {
  const base = { currentId: "r1", seenId: null, notifiedId: null, onToday: false };
  it("recado novo fora da Hoje: marcador e toast", () => {
    expect(announcementNotice(base)).toEqual({ dot: true, toast: true });
  });
  it("já avisado: só o marcador até ver", () => {
    expect(announcementNotice({ ...base, notifiedId: "r1" })).toEqual({ dot: true, toast: false });
  });
  it("visto, na Hoje ou sem recado: nada", () => {
    expect(announcementNotice({ ...base, seenId: "r1" })).toEqual({ dot: false, toast: false });
    expect(announcementNotice({ ...base, onToday: true })).toEqual({ dot: false, toast: false });
    expect(announcementNotice({ ...base, currentId: null })).toEqual({ dot: false, toast: false });
  });
  it("recado trocado depois de visto: avisa de novo", () => {
    expect(announcementNotice({ ...base, currentId: "r2", seenId: "r1", notifiedId: "r1" })).toEqual({ dot: true, toast: true });
  });
});
