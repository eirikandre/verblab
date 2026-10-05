/*
 * Bygg: slår sammen og minifiserer kilden til dist/
 *
 *   alle <script src="js/…"> i index.html   →  dist/app.min.js
 *   alle <link rel=stylesheet href="css/…"> →  dist/style.min.css
 *   index.html                              →  dist/index.html (peker på de to)
 *
 * Fillista er ikke skrevet ned her: skriptet leser taggene ut av index.html og
 * beholder rekkefølgen derfra – den samme rekkefølgen nettleseren bruker. Legger
 * du til en ny kildefil, er det nok å føre den inn i index.html.
 *
 * Til slutt sjekkes det at ingen lenke til js/ eller css/ er igjen i den bygde
 * html-en, så en fil som ikke ble tatt med stopper bygget i stedet for å gi en
 * dist/ som mangler kode.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const esbuild = require("esbuild");

const ROT = path.join(__dirname, "..");
const DIST = path.join(ROT, "dist");
const HTML_FIL = "index.html";

const les = f => fs.readFileSync(path.join(ROT, f), "utf8");
const kb = n => (n / 1024).toFixed(1).replace(".", ",") + " kB";
const gzip = tekst => zlib.gzipSync(Buffer.from(tekst)).length;

const SKRIPT = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>\s*/g;
const LENKE  = /<link\b[^>]*>\s*/g;

/** js/app.js og ./js/app.js er samme fil – begge skrivemåter skal tas med. */
const rydd = sti => sti.replace(/^\.\//, "");

/**
 * Bytter ut kildetaggene med én tagg til den bygde fila: den første treffet blir
 * erstatningen, resten fjernes. Tagger som peker andre steder (favicon, eksterne
 * skript) står urørt. Returnerer html-en og lista over filene som ble tatt med.
 */
function samle(html, regex, hørerTil, erstatning) {
  const filer = [];
  const ut = html.replace(regex, (...treff) => {
    const hele = treff[0];
    // Andre argument er første fangstgruppe – eller posisjonen, om regexet
    // ikke har noen. Bare strenger sendes videre.
    const kapring = typeof treff[1] === "string" ? treff[1] : null;
    const fil = hørerTil(hele, kapring);
    if (!fil) return hele;
    filer.push(fil);
    return filer.length === 1 ? erstatning + "\n" : "";
  });
  return { ut, filer };
}

/** Fjerner kommentarer og innrykk – lar innhold i tekstnoder stå i fred. */
function minifiserHtml(html) {
  return html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, "")
    .replace(/>\s*\n\s*</g, "><")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

async function bygg() {
  const html = les(HTML_FIL);

  // Finn kildefilene i index.html og bytt taggene mot de bygde filene.
  const js = samle(html, SKRIPT,
    (hele, src) => (rydd(src).startsWith("js/") ? rydd(src) : null),
    '<script src="app.min.js"></script>');

  const css = samle(js.ut, LENKE, hele => {
    if (!/\brel=["']stylesheet["']/.test(hele)) return null;   // hopper over favicon
    const treff = hele.match(/\bhref=["']([^"']+)["']/);
    return treff && rydd(treff[1]).startsWith("css/") ? rydd(treff[1]) : null;
  }, '<link rel="stylesheet" href="style.min.css">');

  if (!js.filer.length) throw new Error("Fant ingen <script src=\"js/…\"> i " + HTML_FIL);
  if (!css.filer.length) throw new Error("Fant ingen <link rel=stylesheet href=\"css/…\"> i " + HTML_FIL);

  const htmlUt = css.ut;
  // Bevisst løsere enn taggmatcherne over: vakten skal fange opp også de
  // skrivemåtene de ikke klarer å tolke, i stedet for at fila faller stille ut.
  const glemt = htmlUt.match(/(?:src|href)\s*=\s*["']?(?:\.\/)?(?:js|css)\/[^\s"'>]*/g);
  if (glemt) {
    throw new Error("Disse kildelenkene ble ikke byttet ut i " + HTML_FIL + ":\n  " +
      glemt.join("\n  ") + "\nEr taggene skrevet på en annen form enn de andre?");
  }

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const jsKilde = js.filer.map(les).join("\n");
  const jsMin = await esbuild.transform(jsKilde, {
    loader: "js",
    minify: true,
    target: ["es2020"],
    legalComments: "none"
  });
  fs.writeFileSync(path.join(DIST, "app.min.js"), jsMin.code);

  const cssKilde = css.filer.map(les).join("\n");
  const cssMin = await esbuild.transform(cssKilde, { loader: "css", minify: true });
  fs.writeFileSync(path.join(DIST, "style.min.css"), cssMin.code);

  const htmlMin = minifiserHtml(htmlUt);
  fs.writeFileSync(path.join(DIST, "index.html"), htmlMin);

  const rader = [
    ["index.html", html.length, htmlMin.length, gzip(htmlMin)],
    ["style.min.css", cssKilde.length, cssMin.code.length, gzip(cssMin.code)],
    ["app.min.js", jsKilde.length, jsMin.code.length, gzip(jsMin.code)]
  ];

  console.log("Bygget til dist/\n");
  console.log("  js:  " + js.filer.join(" + "));
  console.log("  css: " + css.filer.join(" + ") + "\n");
  console.log("  fil              før       etter     gzip");
  rader.forEach(([navn, før, etter, gz]) =>
    console.log("  " + navn.padEnd(16) + kb(før).padEnd(10) + kb(etter).padEnd(10) + kb(gz)));

  const sum = rader.reduce((a, r) => [a[0] + r[1], a[1] + r[2], a[2] + r[3]], [0, 0, 0]);
  console.log("  " + "totalt".padEnd(16) + kb(sum[0]).padEnd(10) + kb(sum[1]).padEnd(10) + kb(sum[2]));
}

bygg().catch(e => { console.error(e.message); process.exit(1); });
