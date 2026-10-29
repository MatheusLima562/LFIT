"use client";

import { RouteError } from "@/components/layout/RouteError";

export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError retry={retry} homeHref="/" />;
}
