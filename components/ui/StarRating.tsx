import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = { sm: "size-3", md: "size-4", lg: "size-5" };

export function StarRating({ value, size = "md", className }: StarRatingProps) {
  const rounded = Math.round(value);
  return (
    <span
      role="img"
      aria-label={`${value.toLocaleString("pt-BR")} de 5 estrelas`}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn(
            sizes[size],
            n <= rounded ? "fill-amber-400 text-amber-400" : "fill-line text-line",
          )}
        />
      ))}
    </span>
  );
}
