import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mensagem de erro/sucesso dos formulários de autenticação (anunciada ao leitor de tela). */
export function AuthMessage({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-snug",
        tone === "error" ? "border-danger-line bg-danger-soft text-danger-ink" : "border-success-line bg-success-soft text-success-ink",
      )}
    >
      <Icon aria-hidden className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
