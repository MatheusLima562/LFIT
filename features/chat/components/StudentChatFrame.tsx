"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { keyboardLikelyOpen } from "@/features/student-app/humanize";

/**
 * Altura da conversa do aluno. Sem teclado: a tela menos o cabeçalho do app e a barra de abas (CSS, com as áreas
 * seguras). Com o teclado aberto, o iOS não encolhe o `100dvh`: a altura passa a ir do topo da conversa até o fim da
 * área visível (`visualViewport`), para o campo de envio não ficar atrás do teclado.
 */
export function StudentChatFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const el = ref.current;
      if (!el || !keyboardLikelyOpen(vv.height, window.innerHeight)) return setHeight(null);
      setHeight(Math.max(0, Math.floor(vv.offsetTop + vv.height - el.getBoundingClientRect().top)));
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return (
    // Cabeçalho e barra de abas (3.5rem cada, + 1px de borda cada) + áreas seguras; as margens negativas anulam o respiro do <main>.
    <div
      ref={ref}
      style={height === null ? undefined : { height }}
      className="-mx-4 -mt-4 -mb-6 h-[calc(100dvh-7rem-2px-env(safe-area-inset-top)-env(safe-area-inset-bottom))]"
    >
      {children}
    </div>
  );
}
