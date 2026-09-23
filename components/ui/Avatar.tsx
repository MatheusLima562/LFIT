import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";

const palettes = [
  "bg-brand-100 text-brand-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
];

function paletteFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palettes[hash % palettes.length];
}

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "size-7 text-[11px]",
  md: "size-8 text-xs",
  lg: "size-9 text-[13px]",
};

export function Avatar({ name, size = "md", className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        sizes[size],
        paletteFor(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
