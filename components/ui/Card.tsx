import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isAvailableRoute } from "@/data/navigation";
import { messages } from "@/messages/pt-BR";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** id do título, usado em aria-labelledby. */
  labelledBy?: string;
}

export function Card({ children, className, labelledBy }: CardProps) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 shadow-card",
        className,
      )}
    >
      {children}
    </section>
  );
}

interface CardHeaderProps {
  id: string;
  title: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ id, title, icon, action, className }: CardHeaderProps) {
  return (
    <header className={cn("mb-4 flex items-center justify-between gap-3", className)}>
      <h2 id={id} className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
        {icon}
        <span className="truncate">{title}</span>
      </h2>
      {action}
    </header>
  );
}

export function CardIcon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg bg-canvas text-ink-2 [&_svg]:size-4",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer className={cn("mt-auto flex items-center justify-between gap-3 pt-4", className)}>
      {children}
    </footer>
  );
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  if (!isAvailableRoute(href)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3" aria-disabled="true">
        {children}
        <span className="rounded-md bg-canvas px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ring-1 ring-line">
          {messages.app.soon}
        </span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-brand-700 outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {children}
      <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
