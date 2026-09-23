"use client";

import Script from "next/script";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

export interface TurnstileHandle {
  reset: () => void;
}

/** Widget do Cloudflare Turnstile (verificação anti-robô, em pt-BR). */
export const Turnstile = forwardRef<TurnstileHandle, { siteKey: string; onToken: (token: string | null) => void }>(function Turnstile(
  { siteKey, onToken },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(() => typeof window !== "undefined" && Boolean(window.turnstile));

  const render = useCallback(() => {
    if (!container.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      language: "pt-br",
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
    });
  }, [siteKey, onToken]);

  useEffect(() => {
    if (loaded) render();
    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [loaded, render]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      onToken(null);
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
    },
  }));

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
      />
      <div ref={container} className="min-h-[65px]" />
    </>
  );
});
