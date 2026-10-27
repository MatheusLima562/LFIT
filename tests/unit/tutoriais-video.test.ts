import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { comDuracao, duracaoWebm, montarSrt, quebrarLinhas, tempoSrt } from "../../e2e/tutoriais/_midia.mjs";

const DIR = path.join(process.cwd(), "e2e", "tutoriais");

describe("legendas .srt", () => {
  it("formata o tempo", () => {
    expect(tempoSrt(0)).toBe("00:00:00,000");
    expect(tempoSrt(83_456)).toBe("00:01:23,456");
    expect(tempoSrt(3_723_004)).toBe("01:02:03,004");
  });
  it("quebra em linhas de até 42 caracteres sem cortar palavras", () => {
    const linhas = quebrarLinhas("Acesso expirando: alunos cujo acesso ao app vence nos próximos dias.");
    expect(linhas.every((l) => l.length <= 42)).toBe(true);
    expect(linhas.join(" ")).toBe("Acesso expirando: alunos cujo acesso ao app vence nos próximos dias.");
  });
  it("numera as entradas e ignora legenda vazia ou sem duração", () => {
    const srt = montarSrt([
      { inicio: 800, fim: 4200, texto: "Clique em Entrar." },
      { inicio: 4300, fim: 4300, texto: "sem duração" },
      { inicio: 4300, fim: 9000, texto: "" },
      { inicio: 9100, fim: 12000, texto: "Esta é a tela Início." },
    ]);
    expect(srt).toBe("1\n00:00:00,800 --> 00:00:04,200\nClique em Entrar.\n\n2\n00:00:09,100 --> 00:00:12,000\nEsta é a tela Início.\n");
  });
});

/** WebM mínimo como o do MediaRecorder: Segment e Cluster de tamanho desconhecido, Info sem Duration. */
function webmSintetico() {
  const el = (id: number[], dados: number[]) => [...id, 0x80 | dados.length, ...dados];
  const ebml = el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], [0x77, 0x65, 0x62, 0x6d])); // DocType "webm"
  const info = el([0x15, 0x49, 0xa9, 0x66], el([0x2a, 0xd7, 0xb1], [0x0f, 0x42, 0x40])); // TimecodeScale = 1 ms
  const bloco = (rel: number) => el([0xa3], [0x81, (rel >> 8) & 0xff, rel & 0xff, 0x80, 0x00]); // trilha 1, tempo relativo
  const cluster = (tc: number[], ...blocos: number[][]) => [0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...el([0xe7], tc), ...blocos.flat()];
  const segmento = [0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
  return Buffer.from([...ebml, ...segmento, ...info, ...cluster([0x00], bloco(0), bloco(33)), ...cluster([0x27, 0x10], bloco(0), bloco(500))]);
}

describe("duração do .webm", () => {
  it("sem Duration: usa o último bloco (+ 1 quadro)", () => {
    expect(duracaoWebm(webmSintetico())).toBe(10_000 + 500 + 33);
  });
  it("comDuracao grava o campo e não muda os quadros", () => {
    const original = webmSintetico();
    const corrigido = comDuracao(original);
    expect(corrigido.length).toBe(original.length + 11 + 7); // elemento Duration + tamanho do Info em 8 bytes
    expect(duracaoWebm(corrigido)).toBe(10_533);
    expect(comDuracao(corrigido)).toBe(corrigido); // já tem: devolve o mesmo
    expect(corrigido.subarray(corrigido.length - 40).equals(original.subarray(original.length - 40))).toBe(true);
  });
});

describe("roteiros dos vídeos", () => {
  const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".roteiro.mjs"));

  it("existem e seguem o padrão NN-nome.roteiro.mjs", () => {
    expect(arquivos.length).toBeGreaterThanOrEqual(3);
    for (const f of arquivos) expect(f).toMatch(/^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.roteiro\.mjs$/);
  });

  it.each(arquivos)("%s: usuário fictício do seed, legendas curtas", async (arquivo) => {
    const { default: roteiro } = await import(path.join(DIR, arquivo));
    expect(roteiro.titulo).toBeTruthy();
    expect(roteiro.usuario).toMatch(/\.seed@example\.com$/);
    expect(roteiro.passos.length).toBeGreaterThan(0);
    for (const passo of roteiro.passos) {
      expect(typeof passo.acao).toBe("function");
      expect(passo.legenda.trim().length, passo.legenda).toBeGreaterThan(0);
      expect(quebrarLinhas(passo.legenda).length, `legenda longa demais (máx. 2 linhas): ${passo.legenda}`).toBeLessThanOrEqual(2);
    }
  });
});
