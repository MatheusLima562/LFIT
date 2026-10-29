"use client";

import { useEffect } from "react";
import { markAnnouncementSeen } from "./hooks";

/** Na tela Hoje: o aluno viu o recado — some o marcador da aba. */
export function AnnouncementSeen({ id }: { id: string }) {
  useEffect(() => markAnnouncementSeen(id), [id]);
  return null;
}
