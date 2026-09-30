"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages/pt-BR";
import { startSession } from "../actions";

const t = messages.aluno.today;

/** Inicia (ou retoma) a sessão e abre a execução; pede a pergunta de dor quando a RPC indicar. */
export function StartWorkoutButton({
  planId,
  workoutId,
  label,
  variant = "default",
}: {
  planId: string;
  workoutId: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="lg"
      variant={variant}
      disabled={pending}
      className="h-12 w-full text-base"
      onClick={() =>
        startTransition(async () => {
          const r = await startSession(planId, workoutId);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          router.push(`/aluno/treino/${r.sessionId}${r.askPainCheckin ? "?checkin=1" : ""}`);
        })
      }
    >
      <Play aria-hidden />
      {pending ? t.starting : (label ?? t.start)}
    </Button>
  );
}
