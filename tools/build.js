/*
 * Bygg: slår sammen og minifiserer kilden til dist/
 *
 *   js/config.js + js/storage.js + js/app.js  →  dist/app.min.js
 *   css/style.css                             →  dist/style.min.css
 *   index.html                                →  dist/index.html (peker på de to over)
 *
 * Rekkefølgen på JS-filene er den samme som i index.html: config først,
 * så storage, så app.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const esbuild = require("esbuild");

const ROT = path.join(__dirname, "..");
const DIST = path.join(ROT, "dist");

const JS_FILER = ["js/config.js", "js/storage.js", "js/app.js"];
const CSS_FIL = "css/style.css";
const HTML_FIL = "index.html";

const les = f => fs.readFileSync(path.join(ROT, f), "utf8");
const kb = n => (n / 1024).toFixed(1).replace(".", ",") + " kB";
const gzip = tekst => zlib.gzipSync(Buffer.from(tekst)).length;

/** Fjerner kommentarer og innrykk – lar innhold i tekstnoder stå i fred. */
function minifiserHtml(html) {
  return html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, "")
    .replace(/>\s*\n\s*</g, "><")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

async function bygg() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // JS – filene slås sammen i samme rekkefølge som skript-taggene i index.html
  const js = JS_FILER.map(les).join("\n");
  const jsMin = await esbuild.transform(js, {
    loader: "js",
    minify: true,
    target: ["es2020"],
    legalComments: "none"
  });
  fs.writeFileSync(path.join(DIST, "app.min.js"), jsMin.code);

  // CSS
  const css = les(CSS_FIL);
  const cssMin = await esbuild.transform(css, { loader: "css", minify: true });
  fs.writeFileSync(path.join(DIST, "style.min.css"), cssMin.code);

  // HTML – bytt ut lenkene til kilden med de bygde filene
  const html = les(HTML_FIL)
    .replace('<link rel="stylesheet" href="css/style.css">', '<link rel="stylesheet" href="style.min.css">')
    .replace(/\s*<script src="js\/(config|storage)\.js"><\/script>/g, "")
    .replace('<script src="js/app.js"></script>', '<script src="app.min.js"></script>');

  if (html.includes("js/config.js") || html.includes("css/style.css")) {
    throw new Error("Klarte ikke å bytte ut kildelenkene i index.html – er skript-taggene endret?");
  }
  const htmlMin = minifiserHtml(html);
  fs.writeFileSync(path.join(DIST, "index.html"), htmlMin);

  const rader = [
    ["index.html", html.length, htmlMin.length, gzip(htmlMin)],
    ["style.min.css", css.length, cssMin.code.length, gzip(cssMin.code)],
    ["app.min.js", js.length, jsMin.code.length, gzip(jsMin.code)]
  ];

  console.log("Bygget til dist/\n");
  console.log("  fil              før       etter     gzip");
  rader.forEach(([navn, før, etter, gz]) =>
    console.log("  " + navn.padEnd(16) + kb(før).padEnd(10) + kb(etter).padEnd(10) + kb(gz)));

  const sum = rader.reduce((a, r) => [a[0] + r[1], a[1] + r[2], a[2] + r[3]], [0, 0, 0]);
  console.log("  " + "totalt".padEnd(16) + kb(sum[0]).padEnd(10) + kb(sum[1]).padEnd(10) + kb(sum[2]));
}

bygg().catch(e => { console.error(e.message); process.exit(1); });
