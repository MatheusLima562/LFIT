/**
 * Funções puras dos vídeos de tutorial (sem Playwright): legendas .srt e duração do .webm.
 * Testadas em tests/unit/tutoriais-video.test.ts.
 */

/** Quebra a legenda em linhas de até `max` caracteres (sem cortar palavras). */
export function quebrarLinhas(texto, max = 42) {
  const linhas = [];
  let atual = "";
  for (const palavra of texto.trim().split(/\s+/)) {
    if (atual && `${atual} ${palavra}`.length > max) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = atual ? `${atual} ${palavra}` : palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** 83456 → "00:01:23,456" */
export function tempoSrt(ms) {
  const t = Math.max(0, Math.round(ms));
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(t / 3_600_000))}:${p(Math.floor(t / 60_000) % 60)}:${p(Math.floor(t / 1000) % 60)},${p(t % 1000, 3)}`;
}

/** Monta o .srt a partir de [{ inicio, fim, texto }] (ms desde o início do vídeo). */
export function montarSrt(legendas) {
  return legendas
    .filter((l) => l.texto && l.fim > l.inicio)
    .map((l, i) => `${i + 1}\n${tempoSrt(l.inicio)} --> ${tempoSrt(l.fim)}\n${quebrarLinhas(l.texto).join("\n")}\n`)
    .join("\n");
}

// --- WebM (EBML) ----------------------------------------------------------------------------------------------
// O MediaRecorder do Chrome grava o .webm sem a duração no cabeçalho (o player mostra "--:--" e não deixa avançar).
// `duracaoWebm` lê o maior timestamp dos blocos; `comDuracao` grava o campo Duration em Segment › Info.

const ID = { SEGMENT: 0x18538067, INFO: 0x1549a966, CLUSTER: 0x1f43b675, BLOCKGROUP: 0xa0, TIMECODE_SCALE: 0x2ad7b1, DURATION: 0x4489, CLUSTER_TIMECODE: 0xe7, SIMPLEBLOCK: 0xa3, BLOCK: 0xa1 };
const CONTAINERS = new Set([ID.SEGMENT, ID.INFO, ID.CLUSTER, ID.BLOCKGROUP]);

function lerId(buf, pos) {
  let len = 1;
  for (let mask = 0x80; len <= 4 && !(buf[pos] & mask); mask >>= 1) len++;
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + buf[pos + i];
  return { id, len };
}

function lerTamanho(buf, pos) {
  let len = 1, mask = 0x80;
  for (; len <= 8 && !(buf[pos] & mask); mask >>= 1) len++;
  let valor = buf[pos] & (mask - 1);
  let desconhecido = valor === mask - 1;
  for (let i = 1; i < len; i++) {
    valor = valor * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) desconhecido = false;
  }
  return { valor, len, desconhecido };
}

const lerUint = (buf, pos, size) => { let v = 0; for (let i = 0; i < size; i++) v = v * 256 + buf[pos + i]; return v; };

/** Percorre os elementos (desce nos contêineres; tamanho "desconhecido" do MediaRecorder também funciona). */
function analisar(buf) {
  let pos = 0, escala = 1_000_000, cluster = 0, maior = 0, info = null, duracao = null, segmentoConhecido = false;
  while (pos < buf.length) {
    const { id, len: il } = lerId(buf, pos);
    const t = lerTamanho(buf, pos + il);
    const dados = pos + il + t.len;
    if (id === ID.SEGMENT && !t.desconhecido) segmentoConhecido = true;
    if (CONTAINERS.has(id)) {
      if (id === ID.INFO) info = { inicio: pos, dados, tamanho: t.valor };
      pos = dados;
      continue;
    }
    if (id === ID.TIMECODE_SCALE) escala = lerUint(buf, dados, t.valor);
    else if (id === ID.CLUSTER_TIMECODE) cluster = lerUint(buf, dados, t.valor);
    else if (id === ID.DURATION) duracao = t.valor === 8 ? buf.readDoubleBE(dados) : buf.readFloatBE(dados);
    else if (id === ID.SIMPLEBLOCK || id === ID.BLOCK) {
      const trilha = lerTamanho(buf, dados);
      maior = Math.max(maior, cluster + buf.readInt16BE(dados + trilha.len));
    }
    if (t.desconhecido) break;
    pos = dados + t.valor;
  }
  return { escala, maior, info, duracao, segmentoConhecido };
}

/** Duração em ms: o campo Duration, se existir; senão, o último bloco + 1 quadro (~33 ms a 30 fps). */
export function duracaoWebm(buf) {
  const a = analisar(buf);
  const porUnidade = a.escala / 1_000_000;
  return a.duracao !== null ? a.duracao * porUnidade : (a.maior + 33) * porUnidade;
}

/** Devolve uma cópia com Duration em Segment › Info (sem mudar nada se já houver ou se o arquivo não for o esperado). */
export function comDuracao(buf) {
  const a = analisar(buf);
  if (!a.info || a.duracao !== null || a.segmentoConhecido) return buf;
  const valor = Buffer.alloc(8);
  valor.writeDoubleBE(a.maior + 33);
  const elemento = Buffer.concat([Buffer.from([0x44, 0x89, 0x88]), valor]); // id Duration, tamanho 8, float64
  const tamanho = Buffer.alloc(8); // tamanho do Info em 8 bytes (0x01 + 7), para não depender do tamanho original
  let resto = a.info.tamanho + elemento.length;
  for (let i = 7; i >= 1; i--) { tamanho[i] = resto % 256; resto = Math.floor(resto / 256); }
  tamanho[0] = 0x01;
  return Buffer.concat([
    buf.subarray(0, a.info.inicio),
    Buffer.from([0x15, 0x49, 0xa9, 0x66]),
    tamanho,
    buf.subarray(a.info.dados, a.info.dados + a.info.tamanho),
    elemento,
    buf.subarray(a.info.dados + a.info.tamanho),
  ]);
}
