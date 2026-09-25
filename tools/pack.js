/*
 * Pakker dist/ til verblab-<versjon>.zip – klar til å legges på en webserver
 * eller sendes videre. Bruker `zip` hvis den finnes, ellers `tar`.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROT = path.join(__dirname, "..");
const DIST = path.join(ROT, "dist");
const versjon = require(path.join(ROT, "package.json")).version;

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("Fant ikke dist/index.html – kjør «npm run build» først.");
  process.exit(1);
}

const finnes = kommando => {
  try { execFileSync("command", ["-v", kommando], { shell: true, stdio: "ignore" }); return true; }
  catch { return false; }
};

let fil;
if (finnes("zip")) {
  fil = `verblab-${versjon}.zip`;
  fs.rmSync(path.join(ROT, fil), { force: true });
  execFileSync("zip", ["-qr", path.join(ROT, fil), "."], { cwd: DIST });
} else {
  fil = `verblab-${versjon}.tar.gz`;
  execFileSync("tar", ["-czf", path.join(ROT, fil), "-C", DIST, "."]);
}

const størrelse = (fs.statSync(path.join(ROT, fil)).size / 1024).toFixed(1).replace(".", ",");
console.log(`Pakket ${fil} (${størrelse} kB)`);
