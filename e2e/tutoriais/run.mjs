/**
 * Gera vídeos de tutorial a partir dos roteiros (e2e/tutoriais/<nome>.roteiro.mjs).
 *   npm run tutoriais:video -- 01-visao-geral          # um roteiro (o prefixo basta: 01)
 *   npm run tutoriais:video -- 01 02 03                # vários, em série
 *   npm run tutoriais:video -- todos                   # todos
 *   ... --legenda-na-tela                              # também escreve a legenda no vídeo (Loom não lê .srt)
 * Saída: tutoriais-video/<nome>.webm + <nome>.srt (fora do git). Só no lfit-dev, com os usuários fictícios do seed.
 */
import { readdirSync } from "node:fs";
import { gravar } from "./_estudio.mjs";

const args = process.argv.slice(2);
const legendaNaTela = args.includes("--legenda-na-tela");
const filtros = args.filter((a) => !a.startsWith("--"));
const disponiveis = readdirSync("e2e/tutoriais").filter((f) => f.endsWith(".roteiro.mjs")).map((f) => f.replace(".roteiro.mjs", "")).sort();

if (!filtros.length) {
  console.error(`Informe o roteiro: npm run tutoriais:video -- <nome>\nDisponíveis: ${disponiveis.join(", ")} (ou "todos")`);
  process.exit(1);
}
const escolhidos = filtros.includes("todos") ? disponiveis : disponiveis.filter((n) => filtros.some((f) => n === f || n.startsWith(`${f}-`)));
const semRoteiro = filtros.filter((f) => f !== "todos" && !disponiveis.some((n) => n === f || n.startsWith(`${f}-`)));
if (semRoteiro.length || !escolhidos.length) {
  console.error(`Roteiro não encontrado: ${semRoteiro.join(", ") || filtros.join(", ")}\nDisponíveis: ${disponiveis.join(", ")}`);
  process.exit(1);
}

let falhas = 0;
for (const nome of escolhidos) {
  const { default: roteiro } = await import(`./${nome}.roteiro.mjs`);
  console.log(`▶ ${nome} — ${roteiro.titulo}`);
  try {
    const r = await gravar(nome, roteiro, { legendaNaTela });
    const seg = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
    console.log(`✓ ${r.arquivoVideo} (${(r.bytes / 1024 / 1024).toFixed(1)} MB, ${seg(r.duracaoMs)}, ${r.passos} passos, ${r.tipo})`);
    console.log(`✓ ${r.arquivoSrt}`);
  } catch (e) {
    falhas++;
    console.error(`✗ ${nome}: ${e.message}`);
  }
}
process.exit(falhas ? 1 : 0);
