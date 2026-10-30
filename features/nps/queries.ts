import "server-only";
import { createClient } from "@/lib/db/server";
import type { NpsSummary } from "./nps";

/**
 * Resumo do NPS no escopo de quem está logado (professor: os seus alunos; owner: a organização + por professor). O
 * comentário de detrator só vem para quem vê a saúde do aluno (regra no banco). Falhou → null (o card some).
 */
export async function getNpsSummary(): Promise<NpsSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_nps_summary");
  if (error || !data) return null;
  return data as unknown as NpsSummary;
}

/** Cartão do NPS para o aluno agora? null = não mostrar (fora dos critérios, "Agora não" ou erro). */
export async function getMyNpsPrompt(): Promise<{ trainerFirstName: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_nps_prompt");
  if (error || !data) return null;
  const p = data as { trainer_first_name: string | null };
  return { trainerFirstName: p.trainer_first_name || null };
}
