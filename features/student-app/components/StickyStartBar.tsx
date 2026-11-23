import Link from "next/link";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages/pt-BR";
import { StartWorkoutButton } from "./StartWorkoutButton";

const t = messages.aluno.today;

/**
 * Botão fixo do Hoje (1.7): "Começar treino {letra}" (ou "Retomar treino") logo ACIMA da barra de abas (56 px + área
 * segura), sem cobrir nada — a página reserva o espaço (`pb` maior no Hoje). Fundo com a cor da página para o conteúdo
 * não aparecer por baixo do botão.
 */
export function StickyStartBar({ planId, workout, openSessionId }: { planId: string; workout: { id: string; label: string }; openSessionId: string | null }) {
  return (
    <div
      data-testid="sticky-start"
      className="fixed inset-x-0 z-20 border-t border-line bg-canvas/95 px-4 py-2 backdrop-blur supports-backdrop-filter:bg-canvas/80"
      // Barra de abas = itens de 56 px + borda superior de 1 px (StudentNav) + área segura.
      style={{ bottom: "calc(3.5rem + 1px + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-md">
        {openSessionId ? (
          <Button asChild size="lg" className="h-12 w-full text-base">
            <Link href={`/aluno/treino/${openSessionId}`}>{t.resume}</Link>
          </Button>
        ) : (
          <StartWorkoutButton planId={planId} workoutId={workout.id} label={t.startFixed(workout.label)} />
        )}
      </div>
    </div>
  );
}
