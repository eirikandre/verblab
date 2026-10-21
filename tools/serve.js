/*
 * Liten statisk server for lokal testing – ingen avhengigheter.
 *
 *   node tools/serve.js           kjører kilden (npm run dev)
 *   node tools/serve.js --dist    kjører det bygde resultatet (npm run preview)
 *   PORT=3000 node tools/serve.js
 *
 * Kjøres kilden, hentes filer som ikke finnes i rota fra public/ – slik de
 * ligger i dist/ etter bygget.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROT = path.join(__dirname, "..");
const KATALOG = process.argv.includes("--dist") ? path.join(ROT, "dist") : ROT;
const PORT = Number(process.env.PORT) || 8000;

const TYPER = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const fil = path.join(KATALOG, rel === "/" ? "index.html" : rel);

  if (!fil.startsWith(KATALOG)) { res.writeHead(403).end("403"); return; }

  const publicFil = path.join(ROT, "public", rel);
  const kilde = KATALOG === ROT && !fs.existsSync(fil) && publicFil.startsWith(path.join(ROT, "public"))
    ? publicFil : fil;

  fs.readFile(kilde, (err, data) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain" }).end("404 " + rel); return; }
    res.writeHead(200, {
      "content-type": TYPER[path.extname(kilde)] || "application/octet-stream",
      "cache-control": "no-store"
    }).end(data);
  });
}).listen(PORT, () => {
  console.log(`VerbLab (${KATALOG === ROT ? "kilde" : "dist"}) kjører på http://localhost:${PORT}`);
});
