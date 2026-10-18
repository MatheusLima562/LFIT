import { cn } from "@/lib/utils";
import { initials } from "../humanize";

/**
 * Avatar do professor: iniciais por enquanto. A foto chega na 3.3 (bucket próprio + URL assinada depois de a RPC
 * autorizar); até lá não carregamos `avatar_url` arbitrário — seria uma imagem de terceiros vendo o IP do aluno.
 */
export function TrainerAvatar({ name, className }: { name: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-canvas text-sm font-semibold text-ink-2 ring-1 ring-line", className)}
    >
      {initials(name)}
    </span>
  );
}
