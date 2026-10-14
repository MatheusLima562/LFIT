/**
 * Grava a página em .webm sem ffmpeg: o Chrome manda os quadros da tela (CDP Page.startScreencast) para uma
 * segunda página, que desenha num <canvas> e codifica com o MediaRecorder (VP9/VP8), como o recodificador de
 * vídeo de exercício do app. O `recordVideo` do Playwright exige baixar o ffmpeg dele (fora do projeto).
 */
import { comDuracao } from "./_midia.mjs";

export async function iniciarGravacao(browser, page, { largura = 1280, altura = 720 } = {}) {
  const gravador = await (await browser.newContext()).newPage();
  const partes = [];
  await gravador.exposeFunction("__parte", (b64) => partes.push(Buffer.from(b64, "base64")));
  await gravador.setContent(`<canvas id="c" width="${largura}" height="${altura}"></canvas>`);
  const tipo = await gravador.evaluate(() => {
    const canvas = document.getElementById("c");
    const g = canvas.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    let ultimo = 0;
    let pendentes = 0;
    window.__quadro = async (b64, seq) => {
      pendentes++;
      try {
        const img = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
        if (seq > ultimo) {
          ultimo = seq;
          g.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      } finally {
        pendentes--;
      }
    };
    // A tela só manda quadro quando algo muda: repinta o último para o vídeo seguir a 30 fps nas pausas.
    setInterval(() => g.drawImage(canvas, 0, 0), 33);
    const tipo = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: tipo, videoBitsPerSecond: 3_000_000 });
    rec.ondataavailable = async (e) => {
      const bytes = new Uint8Array(await e.data.arrayBuffer());
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await window.__parte(btoa(s));
    };
    window.__parar = async () => {
      while (pendentes) await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => { rec.onstop = () => setTimeout(r, 300); rec.stop(); });
    };
    rec.start(1000);
    return tipo;
  });

  const cdp = await page.context().newCDPSession(page);
  let seq = 0;
  cdp.on("Page.screencastFrame", (f) => {
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    const n = ++seq;
    gravador.evaluate(([dados, n]) => window.__quadro(dados, n), [f.data, n]).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: largura, maxHeight: altura });

  return {
    tipo,
    /** Encerra e devolve o .webm (com a duração no cabeçalho). */
    async parar() {
      await cdp.send("Page.stopScreencast").catch(() => {});
      await gravador.evaluate(() => window.__parar());
      await gravador.context().close();
      return comDuracao(Buffer.concat(partes));
    },
  };
}
