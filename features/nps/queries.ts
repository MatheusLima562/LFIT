import "server-only";
import { createClient } from "@/lib/db/server";
import { isNpsSummary, type NpsStaffStatus, type NpsSummary } from "./nps";

/**
 * Resumo do NPS no escopo de quem está logado (professor: as respostas sobre ele; owner: a organização + por
 * professor), só agregados por trimestre fechado. Falhou ou formato antigo → null (o card some).
 */
export async function getNpsSummary(): Promise<NpsSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_nps_summary");
  if (error || !isNpsSummary(data)) return null;
  return data;
}

/** Cartão do NPS para o aluno agora? null = não mostrar (fora dos critérios, "Agora não" ou erro). */
export async function getMyNpsPrompt(): Promise<{ trainerFirstName: string | null; intervalDays: number; reminded: boolean } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_nps_prompt");
  if (error || !data) return null;
  const p = data as { trainer_first_name: string | null; interval_days?: number; reminded?: boolean };
  // Sem interval_days = função antiga (antes da v2): não mostra o cartão.
  if (typeof p.interval_days !== "number") return null;
  return { trainerFirstName: p.trainer_first_name || null, intervalDays: p.interval_days, reminded: p.reminded === true };
}

/** Estado do aluno para a equipe (owner ou responsável). null = sem acesso ou erro: a seção não aparece. */
export async function getNpsStatus(studentId: string): Promise<NpsStaffStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_nps_status", { p_student_id: studentId });
  if (error || !data) return null;
  return data as unknown as NpsStaffStatus;
}
