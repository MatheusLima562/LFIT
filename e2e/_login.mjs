/**
 * Espera o login terminar em `url`. Se não terminar, imprime a mensagem da tela (ex.: "Muitas tentativas…", o limite de
 * 30 logins a cada 5 min por IP do Supabase Auth) numa linha "✗", que o executor mostra, e repassa o erro.
 */
export async function waitLoggedIn(page, url, timeout = 30000) {
  await page.waitForURL(url, { timeout }).catch(async (e) => {
    const text = await page.locator("main, body").first().innerText().catch(() => "");
    console.log(`✗ login não concluiu (${page.url()}): ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    throw e;
  });
}
