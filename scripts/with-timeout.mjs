#!/usr/bin/env node
// Roda um comando com prazo (o macOS não tem `timeout`). Estourou → mata o grupo de processos inteiro (inclusive os
// workers do Vitest) e sai com 124, como o `timeout` do coreutils.
// Uso: node scripts/with-timeout.mjs <segundos> <comando> [args...]
import { spawn } from "node:child_process";

const [secs, cmd, ...args] = process.argv.slice(2);
const limit = Number(secs);
if (!cmd || !Number.isFinite(limit) || limit <= 0) {
  console.error("Uso: node scripts/with-timeout.mjs <segundos> <comando> [args...]");
  process.exit(2);
}

const child = spawn(cmd, args, { stdio: "inherit", detached: true });
const killGroup = (signal) => {
  try {
    process.kill(-child.pid, signal);
  } catch {
    // grupo já encerrado
  }
};
const timer = setTimeout(() => {
  console.error(`\n✗ passou de ${limit} s — encerrado (${cmd} ${args.join(" ")})`);
  killGroup("SIGTERM");
  setTimeout(() => killGroup("SIGKILL"), 5000).unref();
  process.exitCode = 124;
}, limit * 1000);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => killGroup(signal));
child.on("exit", (code, signal) => {
  clearTimeout(timer);
  if (process.exitCode !== 124) process.exitCode = code ?? (signal ? 1 : 0);
});
