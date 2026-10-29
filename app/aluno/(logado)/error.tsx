"use client";

import { RouteError } from "@/components/layout/RouteError";

export default function StudentAppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError retry={retry} homeHref="/aluno" />;
}
