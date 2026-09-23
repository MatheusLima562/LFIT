import { cn } from "@/lib/cn";

interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  className?: string;
  barClassName?: string;
}

export function ProgressBar({ value, max, label, className, barClassName }: ProgressBarProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-canvas ring-1 ring-inset ring-line", className)}
    >
      <div
        className={cn(
          "h-full rounded-full bg-linear-to-r from-brand-400 to-brand-500 transition-[width] duration-500",
          barClassName,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
