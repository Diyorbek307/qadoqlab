#!/usr/bin/env node
/**
 * Renders the PNG icons and the Open Graph image from the SVG sources into src/static/.
 * Only needed when the mark or illustrations change. Requires Playwright, which is not
 * a dependency of the site: node scripts/render-static.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { scenes, MARK_PATHS } = require('../src/illustrations');

const STATIC = path.join(__dirname, '..', 'src', 'static');
const fontUrl = 'file://' + path.join(__dirname, '..', 'src', 'assets', 'fonts', 'manrope-latin-wght-normal.woff2');
const favicon = fs.readFileSync(path.join(STATIC, 'favicon.svg'), 'utf8');

const ogHtml = `<!doctype html><html><head><style>
@font-face{font-family:M;src:url(${fontUrl}) format('woff2');font-weight:200 800}
html,body{margin:0;width:1200px;height:630px;background:#F7F4ED;font-family:M,sans-serif}
.w{display:grid;grid-template-columns:520px 1fr;height:100%;}
.l{padding:72px 0 72px 80px;display:flex;flex-direction:column;justify-content:space-between;color:#123C2B}
.logo{display:flex;align-items:center;gap:18px}
.logo svg{width:60px;height:60px}
.word{font-weight:700;font-size:44px;letter-spacing:.12em}
.line{width:72px;height:3px;background:#A7653E}
.r{background:linear-gradient(180deg,#F0E9DC,#E9E0CF);display:flex;align-items:center;justify-content:center;padding:28px}
.r svg{width:100%;height:100%}
</style></head><body><div class="w"><div class="l"><div class="logo"><svg viewBox="0 0 32 32"><g fill="none" stroke="#123C2B" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">${MARK_PATHS}</g></svg><span class="word">QADOQLAB</span></div><div class="line"></div></div><div class="r">${scenes.hero()}</div></div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(ogHtml, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(STATIC, 'og.jpg'), type: 'jpeg', quality: 86 });
  // Square icons: the rounded corners are dropped, platforms apply their own mask.
  const square = favicon.replace('rx="6"', 'rx="0"');
  for (const [name, size] of [
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:#123C2B">${square.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
    );
    await page.screenshot({ path: path.join(STATIC, name) });
  }
  await browser.close();
  console.log('✓ og.jpg, favicon-32.png, apple-touch-icon.png → src/static/');
})();
