"use client";

import dynamic from "next/dynamic";

/**
 * Só no navegador: a fila local vive no localStorage e é reaplicada no estado inicial — renderizar no servidor
 * geraria divergência de hidratação.
 */
export const SessionRunnerClient = dynamic(() => import("./SessionRunner").then((m) => m.SessionRunner), { ssr: false });
