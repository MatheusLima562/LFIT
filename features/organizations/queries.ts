import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/db/server";
import type { PlanUsage } from "@/types/dashboard";

const PLAN_NAMES = { free: "Free", pro: "Pro", gold: "Gold" } as const;

/** Uso do plano da organização (vagas = alunos active + blocked). Memorizado por requisição. */
export const getOrganizationPlanUsage = cache(async (): Promise<PlanUsage> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("organization_plan_usage").single();
  if (error || !data) throw new Error("Não foi possível carregar o plano da organização.");

  return {
    planName: PLAN_NAMES[data.plan],
    used: Number(data.used),
    limit: data.student_limit,
    remaining: Number(data.remaining),
    inactive: Number(data.inactive),
  };
});
