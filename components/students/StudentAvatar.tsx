import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";

interface StudentAvatarProps {
  name: string;
  /** URL assinada da foto (bucket privado). Sem foto, mostra as iniciais. */
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = { sm: "size-7", md: "size-8", lg: "size-9" };

export function StudentAvatar({ name, photoUrl, size = "md", className }: StudentAvatarProps) {
  if (!photoUrl) return <Avatar name={name} size={size} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL assinada de curta duração; next/image não agrega aqui
    <img src={photoUrl} alt="" className={cn("shrink-0 rounded-full object-cover", sizes[size], className)} />
  );
}
