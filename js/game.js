/*
 * VerbLab – sykkelløypa (spillmodus)
 * ----------------------------------------------------------------------------
 * En liten pseudo-3D-motor på Canvas 2D: du sykler nedover en vei sett bakfra,
 * og for hvert spørsmål kommer det tre skilt mot deg – ett per felt.
 *
 *   ← →        bytt felt
 *   ↑ / W       hold inne for fart
 *   mellomrom   hopp
 *
 * Sykle inn i skiltet med riktig form for å score. Hoppet er bare pynt – det
 * finnes ingen hindringer å komme seg over, og hopper du over skiltrekka, står
 * spørsmålet ubesvart (det teller likt som å treffe feil skilt).
 *
 * Motoren kan ingenting om verb. Den spør etter en ny runde når løypa er klar
 * og melder tilbake hva spilleren traff:
 *
 *   hentRunde()                   → { ord, norsk, kicker, fasit, alternativer }
 *                                   eller null når økta er ferdig
 *   påResultat(runde, alt, status) status: "riktig" | "feil" | "bom"
 *   påFerdig()                    kalt når spilleren har passert målstreken
 */

const Sykkelspill = (() => {
  "use strict";

  /* ── Verden (world units) ─────────────────────────────────────────────── */

  const VEIBREDDE  = 2600;             // full bredde på asfalten
  const FELT       = [-800, 0, 800];   // midten av hvert felt
  const FELT_MARGIN = 400;             // hvor nær et skilt du må være for å treffe
  /*
   * Kameraet er «telelinse»: langt bak sykkelen og med smal synsvinkel. Det
   * flater ut perspektivet, slik at skiltene blir store nok til å leses i god
   * tid før man må velge felt.
   */
  const KAM_HOYDE  = 820;              // kamera over veien
  const KAM_DYBDE  = 1.45;             // ≈ 1/tan(fov/2)
  const KAM_BAK    = 2300;             // kamera bak sykkelen
  const STEG       = 250;              // lengden på hver veistripe
  const SYNSVIDDE  = 26000;
  const SPAWN      = 9200;             // hvor langt foran skiltene dukker opp
  const MAAL_AVSTAND = 7000;

  const FART_START = 2400;             // world units per sekund
  const FART_MAKS  = 4000;
  const FART_OKNING = 70;              // per løste runde
  const KRASJ_FART = 1500;             // farten rett etter en kræsj
  const FART_GASS  = 6600;             // toppfart når gassen holdes inne
  const GASS_OPP   = 4200;             // akselerasjon med gass
  const GASS_NED   = 3200;             // hvor fort farten faller tilbake igjen

  const HOPP_FART  = 3400;
  const TYNGDE     = 6000;             // apex ≈ 965, ca. 1,1 s i lufta
  const SKILT_BUNN = 330;
  const SKILT_TOPP = 900;              // over denne høyden er du klar av skiltet

  const FELT_BYTTE = 6.5;              // hvor raskt sykkelen glir mellom felt
  const PAUSE_ETTER_SVAR = 1.15;       // sekunder med fasit før neste runde

  /* Farger – løypa har sin egen palett, uavhengig av lys/mørk modus. */
  const F = {
    himmel1: "#5ec8f2", himmel2: "#bfe9fb",
    aas:     "#7fb98a", aasFjern: "#9fcbd8",
    gress1:  "#5faa5b", gress2:   "#57a054",
    vei1:    "#4a4d63", vei2:     "#45485d",
    kant1:   "#f2f3f8", kant2:    "#d04a5a",
    stripe:  "#f6f7fb",
    skilt:   "#fffdf5", skiltRam: "#2b2d44", skiltTekst: "#20223a",
    skiltOk: "#2fbf7c", skiltFeil:"#e4566a",
    stolpe:  "#8b6a4a"
  };

  /* ── Tilstand ─────────────────────────────────────────────────────────── */

  let lerret = null, ctx = null, opp = null;
  let bredde = 0, hoyde = 0, horisont = 0, f = 0;
  let raf = 0, forrigeTid = 0;
  let kjører = false, pauset = false;
  let lydPå = true, lydCtx = null;

  let spiller, kam, rad, mål, partikler, ristetid, meldinger, tid, fart, feltMål, løste;
  let gassInne = false, gassNivå = 0;

  /* ── Småhjelpere ──────────────────────────────────────────────────────── */

  const klem = (v, lav, høy) => (v < lav ? lav : v > høy ? høy : v);

  /** Deterministisk «tilfeldig» tall fra et heltall – gir samme landskap hver gang. */
  const frø = n => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  /* Veien svinger og bølger – begge deler er rene funksjoner av z. */
  const veiX = z => 1100 * Math.sin(z / 9000) + 420 * Math.sin(z / 3300 + 1.7);
  const veiY = z => 260 * Math.sin(z / 7000) + 110 * Math.sin(z / 2600);

  function proj(x, y, z) {
    const dz = z - kam.z;
    if (dz < 80) return null;
    const s = KAM_DYBDE / dz;
    return { x: bredde / 2 + s * (x - kam.x) * f, y: horisont - s * (y - kam.y) * f, s };
  }

  /* ── Lyd (enkle toner, ingen filer) ───────────────────────────────────── */

  function tone(frekvens, lengde, type = "square", styrke = 0.06) {
    if (!lydPå) return;
    try {
      if (!lydCtx) lydCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (lydCtx.state === "suspended") lydCtx.resume();
      const osc = lydCtx.createOscillator(), gain = lydCtx.createGain();
      osc.type = type;
      osc.frequency.value = frekvens;
      gain.gain.setValueAtTime(styrke, lydCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, lydCtx.currentTime + lengde);
      osc.connect(gain).connect(lydCtx.destination);
      osc.start();
      osc.stop(lydCtx.currentTime + lengde);
    } catch (e) { /* lyd er pynt – la spillet gå videre uten */ }
  }

  const lydRiktig = () => { tone(660, .12); setTimeout(() => tone(990, .18), 90); };
  const lydFeil   = () => tone(150, .32, "sawtooth", .08);
  const lydHopp   = () => tone(420, .09, "triangle", .05);
  const lydMål    = () => [523, 659, 784, 1046].forEach((hz, i) => setTimeout(() => tone(hz, .22), i * 110));

  /* ── Oppstart / stopp ─────────────────────────────────────────────────── */

  function nullstill() {
    spiller = { side: 0, felt: 1, z: 0, y: 0, vy: 0, iLufta: false, lut: 0, tramp: 0, krasj: 0 };
    kam = { x: veiX(spiller.z), y: veiY(spiller.z) + KAM_HOYDE, z: spiller.z - KAM_BAK };
    rad = null;
    mål = null;
    partikler = [];
    meldinger = [];
    ristetid = 0;
    feltMål = 1;
    løste = 0;
    tid = 0;
    fart = FART_START;
    gassInne = false;
    gassNivå = 0;
    pauset = false;
  }

  /** Ett stillbilde av løypa – brukes bak startkortet, før løpet settes i gang. */
  function forhåndsvis(nyttLerret) {
    lerret = nyttLerret;
    ctx = lerret.getContext("2d");
    kjører = false;
    nullstill();
    tilpassStørrelse();
    tegn();
  }

  function start(innstillinger) {
    opp = innstillinger;
    lerret = opp.lerret;
    ctx = lerret.getContext("2d");
    if (opp.lyd !== undefined) lydPå = !!opp.lyd;

    nullstill();
    kjører = true;

    tilpassStørrelse();
    window.addEventListener("resize", tilpassStørrelse);
    document.addEventListener("keydown", tast);
    document.addEventListener("keyup", tastOpp);
    lerret.addEventListener("pointerdown", pek);

    nyRunde(0.8);
    forrigeTid = 0;
    raf = requestAnimationFrame(steg);
  }

  function stopp() {
    kjører = false;
    gassInne = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", tilpassStørrelse);
    document.removeEventListener("keydown", tast);
    document.removeEventListener("keyup", tastOpp);
    if (lerret) lerret.removeEventListener("pointerdown", pek);
  }

  const settPause = på => { pauset = !!på; if (pauset) gassInne = false; };
  const settLyd = på => { lydPå = !!på; };

  function tilpassStørrelse() {
    if (!lerret) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = lerret.getBoundingClientRect();
    bredde = Math.max(240, Math.round(r.width));
    hoyde = Math.max(220, Math.round(r.height));
    lerret.width = Math.round(bredde * dpr);
    lerret.height = Math.round(hoyde * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    horisont = hoyde * 0.38;
    f = Math.min(bredde * 0.55, hoyde * 0.95);
  }

  /* ── Styring ──────────────────────────────────────────────────────────── */

  function styr(retning) {
    if (!kjører || pauset) return;
    feltMål = klem(feltMål + retning, 0, FELT.length - 1);
  }

  /** Gass: hold inne for å suse gjennom løypa når du alt vet svaret. */
  function gass(på) {
    gassInne = !!på && kjører && !pauset;
  }

  function hopp() {
    if (!kjører || pauset || spiller.iLufta) return;
    spiller.vy = HOPP_FART;
    spiller.iLufta = true;
    lydHopp();
  }

  function tast(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") { e.preventDefault(); styr(-1); }
    else if (k === "ArrowRight" || k === "d" || k === "D") { e.preventDefault(); styr(1); }
    else if (k === "ArrowUp" || k === "w" || k === "W") { e.preventDefault(); gass(true); }
    else if (k === " " || k === "Spacebar") { e.preventDefault(); hopp(); }
  }

  function tastOpp(e) {
    const k = e.key;
    if (k === " ") e.preventDefault();       // hindrer at siden scroller
    if (k === "ArrowUp" || k === "w" || k === "W") { e.preventDefault(); gass(false); }
  }

  /** Touch: venstre/høyre tredjedel styrer, midten hopper. */
  function pek(e) {
    const r = lerret.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.33) styr(-1);
    else if (x > 0.67) styr(1);
    else hopp();
  }

  /* ── Runder ───────────────────────────────────────────────────────────── */

  function nyRunde(forsinkelse) {
    rad = { vent: forsinkelse || 0, klar: false };
  }

  function hentNesteRunde() {
    const runde = opp.hentRunde();
    if (!runde) {
      rad = null;
      mål = { z: spiller.z + MAAL_AVSTAND, passert: false };
      return;
    }
    const skilt = runde.alternativer.slice(0, FELT.length).map((alt, i) => ({
      alt, felt: i, blink: 0, truffet: false
    }));
    rad = { runde, skilt, z: spiller.z + SPAWN, løst: false, klar: true, vent: 0 };
  }

  function løs(status, skilt) {
    rad.løst = true;
    rad.status = status;
    if (skilt) skilt.truffet = true;

    if (status === "riktig") {
      lydRiktig();
      if (skilt) sprut(skilt, "#2fbf7c");
      melding("Riktig!", F.skiltOk);
      løste++;
      fart = Math.min(FART_MAKS, fart + FART_OKNING);
    } else {
      lydFeil();
      ristetid = 0.45;
      spiller.krasj = 0.55;
      fart = KRASJ_FART;
      melding(status === "bom"
        ? (rad.hoppetOver ? "Hoppet over! " : "Bom! ") + rad.runde.fasit
        : "Feil – " + rad.runde.fasit, F.skiltFeil);
    }

    opp.påResultat(rad.runde, skilt ? skilt.alt : null, status);
    rad.vent = PAUSE_ETTER_SVAR;
  }

  function melding(tekst, farge) {
    meldinger.push({ tekst, farge, liv: 1.5, alder: 0 });
  }

  function sprut(skilt, farge) {
    const p = skiltPunkt(skilt);
    if (!p) return;
    for (let i = 0; i < 26; i++) {
      const v = Math.random() * Math.PI * 2, kraft = 80 + Math.random() * 260;
      partikler.push({
        x: p.x, y: p.y,
        vx: Math.cos(v) * kraft, vy: Math.sin(v) * kraft - 120,
        liv: 0.6 + Math.random() * 0.5, alder: 0,
        størrelse: 3 + Math.random() * 5,
        farge: i % 3 ? farge : "#ffd44d"
      });
    }
  }

  function skiltPunkt(skilt) {
    if (!rad) return null;
    return proj(veiX(rad.z) + FELT[skilt.felt], veiY(rad.z) + (SKILT_BUNN + SKILT_TOPP) / 2, rad.z);
  }

  /* ── Oppdatering ──────────────────────────────────────────────────────── */

  function oppdater(dt) {
    tid += dt;

    /*
     * Marsjfarten stiger litt for hvert riktige svar, og faller etter en kræsj.
     * Holder du gassen inne, legger du deg over marsjfarten til du slipper.
     */
    const marsj = Math.min(FART_MAKS, FART_START + løste * FART_OKNING);
    const ønsketFart = gassInne ? Math.max(marsj, FART_GASS) : marsj;
    if (fart < ønsketFart) fart = Math.min(ønsketFart, fart + (gassInne ? GASS_OPP : 2200) * dt);
    else fart = Math.max(ønsketFart, fart - GASS_NED * dt);
    gassNivå = klem((fart - marsj) / (FART_GASS - marsj), 0, 1);

    spiller.z += fart * dt;
    spiller.tramp += dt * fart / 300;

    // Feltbytte – glid mykt mot målfeltet, og krenge i svingen.
    const feltX = FELT[feltMål];
    spiller.side += (feltX - spiller.side) * Math.min(1, FELT_BYTTE * dt);
    const ønsketLut = klem((feltX - spiller.side) / 500, -1, 1);
    spiller.lut += (ønsketLut - spiller.lut) * Math.min(1, 8 * dt);

    // Hopp
    if (spiller.iLufta) {
      spiller.vy -= TYNGDE * dt;
      spiller.y += spiller.vy * dt;
      if (spiller.y <= 0) { spiller.y = 0; spiller.vy = 0; spiller.iLufta = false; }
    }

    if (ristetid > 0) ristetid = Math.max(0, ristetid - dt);
    if (spiller.krasj > 0) spiller.krasj = Math.max(0, spiller.krasj - dt);

    // Kamera etter sykkelen
    kam.z = spiller.z - KAM_BAK;
    kam.x = veiX(spiller.z) + spiller.side * 0.5;
    kam.y = veiY(spiller.z) + KAM_HOYDE + spiller.y * 0.25;

    oppdaterRad(dt);
    oppdaterMål();
    oppdaterPynt(dt);
  }

  function oppdaterRad(dt) {
    if (!rad) return;

    if (!rad.klar) {                       // venter på at neste runde skal starte
      rad.vent -= dt;
      if (rad.vent <= 0) hentNesteRunde();
      return;
    }

    if (rad.løst) {
      rad.vent -= dt;
      rad.skilt.forEach(s => { s.blink += dt; });
      if (rad.vent <= 0 && rad.z < spiller.z - 400) nyRunde(0);
      return;
    }

    // Treff? Skiltene står i et tynt bånd rundt rad.z.
    const avstand = rad.z - spiller.z;
    if (Math.abs(avstand) < 140) {
      if (spiller.y < SKILT_TOPP) {
        const truffet = rad.skilt.find(s => Math.abs(spiller.side - FELT[s.felt]) < FELT_MARGIN);
        if (truffet) { løs(truffet.alt.riktig ? "riktig" : "feil", truffet); return; }
      } else {
        rad.hoppetOver = true;             // var i lufta da skiltene passerte
      }
    }
    if (avstand < -200) løs("bom", null);   // syklet forbi uten å treffe noe
  }

  function oppdaterMål() {
    if (!mål || mål.passert) return;
    if (spiller.z > mål.z + 600) {
      mål.passert = true;
      lydMål();
      kjører = false;
      setTimeout(() => opp.påFerdig(), 450);
    }
  }

  function oppdaterPynt(dt) {
    partikler.forEach(p => {
      p.alder += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 700 * dt;
    });
    partikler = partikler.filter(p => p.alder < p.liv);

    meldinger.forEach(m => { m.alder += dt; });
    meldinger = meldinger.filter(m => m.alder < m.liv);
  }

  /* ── Tegning ──────────────────────────────────────────────────────────── */

  function tegn() {
    ctx.save();
    if (ristetid > 0) {
      const k = ristetid * 22;
      ctx.translate(Math.sin(tid * 70) * k, Math.cos(tid * 61) * k * 0.6);
    }

    tegnHimmel();
    tegnVei();
    tegnSkilt();
    tegnMål();
    tegnSykkel();
    tegnPartikler();
    ctx.restore();
    tegnFartslinjer();
    tegnMeldinger();
  }

  function tegnHimmel() {
    const g = ctx.createLinearGradient(0, 0, 0, horisont + 40);
    g.addColorStop(0, F.himmel1);
    g.addColorStop(1, F.himmel2);
    ctx.fillStyle = g;
    ctx.fillRect(-40, -40, bredde + 80, horisont + 80);

    // Sol
    ctx.fillStyle = "rgba(255,244,190,.95)";
    ctx.beginPath();
    ctx.arc(bredde * 0.78, horisont * 0.34, Math.max(18, bredde * 0.045), 0, Math.PI * 2);
    ctx.fill();

    // Skyer som sklir sakte forbi
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (let i = 0; i < 5; i++) {
      const x = ((frø(i * 3 + 1) * bredde * 2 - spiller.z * 0.006 - i * 130) % (bredde * 1.6) + bredde * 1.6) % (bredde * 1.6) - bredde * 0.3;
      const y = horisont * (0.18 + frø(i * 7 + 2) * 0.45);
      const s = Math.max(10, bredde * (0.03 + frø(i * 11 + 3) * 0.035));
      sky(x, y, s);
    }

    // Åser i det fjerne – forskyves med svingen for litt parallakse
    const skift = -veiX(kam.z + 12000) * 0.02;
    tegnAas(horisont + 4, bredde * 0.16, F.aasFjern, skift, 0.9);
    tegnAas(horisont + 6, bredde * 0.11, F.aas, skift * 1.6 + 90, 1.35);
  }

  function sky(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, s * 0.6, 0, Math.PI * 2);
    ctx.arc(x + s * 0.7, y + s * 0.1, s * 0.45, 0, Math.PI * 2);
    ctx.arc(x - s * 0.65, y + s * 0.12, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function tegnAas(basis, høyde, farge, skift, frekvens) {
    ctx.fillStyle = farge;
    ctx.beginPath();
    ctx.moveTo(-20, basis);
    for (let x = -20; x <= bredde + 20; x += 14) {
      const t = (x + skift) / bredde;
      const y = basis - høyde * (0.45 + 0.55 * Math.abs(Math.sin(t * Math.PI * frekvens * 2.3 + 0.6)));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(bredde + 20, basis);
    ctx.closePath();
    ctx.fill();
  }

  function tegnVei() {
    ctx.fillStyle = F.gress2;
    ctx.fillRect(0, horisont - 1, bredde, hoyde - horisont + 2);

    const start = Math.floor((kam.z + 200) / STEG) * STEG;
    const antall = Math.ceil(SYNSVIDDE / STEG);

    // Bakerst først, så legger nærmere striper seg oppå.
    for (let i = antall; i >= 0; i--) {
      const z1 = start + i * STEG;
      const z2 = z1 + STEG;
      const p1 = proj(veiX(z1), veiY(z1), z1);
      const p2 = proj(veiX(z2), veiY(z2), z2);
      if (!p1 || !p2) continue;
      if (p1.y < horisont - 2) continue;

      const lys = Math.floor(z1 / STEG) % 2 === 0;
      const b1 = p1.s * VEIBREDDE * f, b2 = p2.s * VEIBREDDE * f;

      // Gress
      ctx.fillStyle = lys ? F.gress1 : F.gress2;
      ctx.fillRect(0, p2.y, bredde, p1.y - p2.y + 1.5);

      // Kantstein
      firkant(p1.x, p1.y, b1 * 0.58, p2.x, p2.y, b2 * 0.58, lys ? F.kant1 : F.kant2);
      // Asfalt
      firkant(p1.x, p1.y, b1 * 0.5, p2.x, p2.y, b2 * 0.5, lys ? F.vei1 : F.vei2);

      // Stiplede feltskiller
      if (Math.floor(z1 / STEG) % 2 === 0) {
        [-400, 400].forEach(dx => {
          const a1 = proj(veiX(z1) + dx, veiY(z1), z1), a2 = proj(veiX(z2) + dx, veiY(z2), z2);
          if (a1 && a2) firkant(a1.x, a1.y, b1 * 0.012, a2.x, a2.y, b2 * 0.012, F.stripe);
        });
      }

      tegnLandskap(z1, i);
    }
  }

  /** Trapes mellom to horisontale linjer – grunnformen i hele veien. */
  function firkant(x1, y1, w1, x2, y2, w2, farge) {
    ctx.fillStyle = farge;
    ctx.beginPath();
    ctx.moveTo(x1 - w1, y1);
    ctx.lineTo(x2 - w2, y2);
    ctx.lineTo(x2 + w2, y2);
    ctx.lineTo(x1 + w1, y1);
    ctx.closePath();
    ctx.fill();
  }

  /** Trær og busker langs veien – plassert deterministisk ut fra stripenummer. */
  function tegnLandskap(z, i) {
    const n = Math.floor(z / STEG);
    const r = frø(n);
    if (r > 0.42) return;

    const side = frø(n + 91) > 0.5 ? 1 : -1;
    const avstand = 1500 + frø(n + 17) * 2600;
    const x = veiX(z) + side * avstand;
    const p = proj(x, veiY(z), z);
    if (!p || p.y < horisont) return;

    const stort = frø(n + 55) > 0.45;
    const h = (stort ? 900 : 420) * (0.75 + frø(n + 71) * 0.5);
    const b = h * (stort ? 0.42 : 0.7);
    const topp = proj(x, veiY(z) + h, z);
    if (!topp) return;

    const bp = p.s * b * f;
    if (stort) {
      ctx.fillStyle = "#6b4a2f";
      ctx.fillRect(p.x - bp * 0.12, topp.y + (p.y - topp.y) * 0.55, bp * 0.24, (p.y - topp.y) * 0.45);
      ctx.fillStyle = frø(n + 5) > 0.5 ? "#2f7d4a" : "#367f3d";
      ctx.beginPath();
      ctx.moveTo(p.x, topp.y);
      ctx.lineTo(p.x + bp, topp.y + (p.y - topp.y) * 0.72);
      ctx.lineTo(p.x - bp, topp.y + (p.y - topp.y) * 0.72);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "#3f8f52";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - (p.y - topp.y) * 0.45, bp * 0.9, (p.y - topp.y) * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function tegnSkilt() {
    if (!rad || !rad.klar) return;
    const z = rad.z;
    if (z < kam.z + 200) return;

    // Ytterfeltene først, midtfeltet sist – da er midtskiltet alltid helt
    // synlig, også når platene så vidt berører hverandre på lang avstand.
    const rekkefølge = rad.skilt.slice().sort((a, b) =>
      Math.abs(FELT[b.felt]) - Math.abs(FELT[a.felt]));

    rekkefølge.forEach(s => {
      const x = veiX(z) + FELT[s.felt];
      const bunn = proj(x, veiY(z), z);
      const toppP = proj(x, veiY(z) + SKILT_TOPP, z);
      const bunnP = proj(x, veiY(z) + SKILT_BUNN, z);
      if (!bunn || !toppP || !bunnP) return;

      const skala = bunn.s * f;
      const platehøyde = Math.max(16, (SKILT_TOPP - SKILT_BUNN) * skala);
      const tekst = s.alt.tekst;

      // Skriften får en nedre grense, ellers blir ordene uleselige på avstand.
      let fontPx = Math.max(12, platehøyde * 0.5);
      ctx.font = "800 " + fontPx + "px system-ui, sans-serif";
      const tekstBredde = ctx.measureText(tekst).width;
      const bb = Math.max(760 * skala, tekstBredde + fontPx * 0.55);
      const bh = Math.max(platehøyde, fontPx * 1.6);
      const midt = (toppP.y + bunnP.y) / 2;

      // Stolpe
      ctx.fillStyle = F.stolpe;
      ctx.fillRect(bunn.x - Math.max(1.5, 26 * skala), midt, Math.max(3, 52 * skala), bunn.y - midt);

      // Plate
      let bak = F.skilt, ramme = F.skiltRam, blekk = F.skiltTekst;
      if (rad.løst) {
        // Blinker ved å bytte farge – ikke gjennomsiktighet, som ville gjort
        // skiltet til glass.
        const lys = Math.sin(rad.skilt[0].blink * 14) > 0;
        if (s.alt.riktig) { bak = lys ? "#57d999" : F.skiltOk; blekk = "#08331f"; ramme = "#0d6b45"; }
        else if (s.truffet) { bak = lys ? "#f37f8e" : F.skiltFeil; blekk = "#3d0b14"; ramme = "#8d2334"; }
      }

      ctx.fillStyle = "rgba(15,18,40,.22)";
      avrundet(bunn.x - bb / 2 + bh * 0.07, midt - bh / 2 + bh * 0.09, bb, bh, bh * 0.22);
      ctx.fill();

      ctx.fillStyle = bak;
      avrundet(bunn.x - bb / 2, midt - bh / 2, bb, bh, bh * 0.22);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, bh * 0.07);
      ctx.strokeStyle = ramme;
      ctx.stroke();

      ctx.fillStyle = blekk;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "800 " + fontPx + "px system-ui, sans-serif";
      ctx.fillText(tekst, bunn.x, midt + fontPx * 0.04);
    });
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  function avrundet(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function tegnMål() {
    if (!mål) return;
    const z = mål.z;
    const bunn = proj(veiX(z), veiY(z), z);
    const topp = proj(veiX(z), veiY(z) + 1500, z);
    if (!bunn || !topp) return;
    const b = bunn.s * VEIBREDDE * f * 0.62;
    const rute = Math.max(4, b / 8);

    ctx.fillStyle = "#2b2d44";
    ctx.fillRect(bunn.x - b, topp.y, b * 2, rute * 1.6);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? "#ffffff" : "#1b1c2e";
      ctx.fillRect(bunn.x - b + i * (b * 2 / 16), topp.y, b * 2 / 16, rute * 1.6);
    }
    ctx.fillStyle = "#8b6a4a";
    ctx.fillRect(bunn.x - b, topp.y, Math.max(2, b * 0.05), bunn.y - topp.y);
    ctx.fillRect(bunn.x + b - Math.max(2, b * 0.05), topp.y, Math.max(2, b * 0.05), bunn.y - topp.y);

    const px = Math.max(11, rute * 1.15);
    ctx.font = "900 " + px + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tb = ctx.measureText("MÅL").width;
    ctx.fillStyle = "#e8452f";
    avrundet(bunn.x - tb / 2 - px * 0.5, topp.y + rute * 0.05, tb + px, rute * 1.5, rute * 0.4);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText("MÅL", bunn.x, topp.y + rute * 0.82);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  function tegnSykkel() {
    const z = spiller.z;
    const x = veiX(z) + spiller.side;
    const bakke = proj(x, veiY(z), z);
    const kropp = proj(x, veiY(z) + spiller.y, z);
    if (!bakke || !kropp) return;

    const s = kropp.s * f;
    const hjul = 165 * s;          // hjulradius på skjermen
    const cx = kropp.x;
    const cy = kropp.y;

    // Skygge på veien – krymper når du er i lufta
    const luft = klem(1 - spiller.y / 1100, 0.35, 1);
    ctx.fillStyle = "rgba(10,12,30," + (0.28 * luft) + ")";
    ctx.beginPath();
    ctx.ellipse(bakke.x, bakke.y, hjul * 1.25 * luft, hjul * 0.32 * luft, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spiller.lut * 0.12 + (spiller.krasj > 0 ? Math.sin(tid * 40) * 0.12 : 0));

    const l = 1;  // alt tegnes relativt til hjulradius
    const hj = hjul;

    /*
     * Vi ser sykkelen rett bakfra, så hjulene står på kant: de tegnes som smale,
     * loddrette ellipser. En hel sirkel ville sett ut som et hjul montert på tvers.
     */
    const felgB = hj * 0.24;         // halve hjulbredden sett bakfra

    // Forhjulet ligger lenger framme og titter så vidt fram under rammen
    ctx.strokeStyle = "#2b2d44";
    ctx.lineWidth = Math.max(1.2, hj * 0.07);
    ctx.beginPath();
    ctx.ellipse(0, -hj * 0.72, felgB * 0.75, hj * 0.44, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Bakhjul
    ctx.strokeStyle = "#1c1d2e";
    ctx.lineWidth = Math.max(1.6, hj * 0.1);
    ctx.beginPath();
    ctx.ellipse(0, -hj * 0.55, felgB, hj * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Eiker – på kant ser vi dem svinge opp og ned inne i hjulet
    ctx.strokeStyle = "rgba(220,225,245,.7)";
    ctx.lineWidth = Math.max(0.8, hj * 0.035);
    for (let i = 0; i < 6; i++) {
      const v = spiller.tramp * 0.6 + (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(0, -hj * 0.55);
      ctx.lineTo(Math.cos(v) * felgB * 0.75, -hj * 0.55 + Math.sin(v) * hj * 0.45);
      ctx.stroke();
    }

    // Nav
    ctx.fillStyle = "#c9cde3";
    ctx.beginPath();
    ctx.ellipse(0, -hj * 0.55, Math.max(0.8, hj * 0.05), Math.max(1.2, hj * 0.08), 0, 0, Math.PI * 2);
    ctx.fill();

    // Bakstag – smal V opp mot setet
    ctx.strokeStyle = "#e8452f";
    ctx.lineWidth = Math.max(1.2, hj * 0.07);
    [-1, 1].forEach(d => {
      ctx.beginPath();
      ctx.moveTo(d * felgB * 0.75, -hj * 0.55);
      ctx.lineTo(d * hj * 0.04, -hj * 1.3);
      ctx.stroke();
    });

    // Setestang
    ctx.strokeStyle = "#e8452f";
    ctx.lineWidth = Math.max(1.6, hj * 0.1);
    ctx.beginPath();
    ctx.moveTo(0, -hj * 0.6);
    ctx.lineTo(0, -hj * 1.4);
    ctx.stroke();

    // Styre – stikker godt ut til sidene så sykkelen ikke ser ut som en ethjuling
    ctx.strokeStyle = "#2b2d44";
    ctx.lineWidth = Math.max(2, hj * 0.14);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-hj * 0.95, -hj * 1.62);
    ctx.lineTo(hj * 0.95, -hj * 1.62);
    ctx.stroke();
    ctx.strokeStyle = "#1c1d2e";
    ctx.lineWidth = Math.max(2, hj * 0.2);
    [-1, 1].forEach(d => {
      ctx.beginPath();
      ctx.moveTo(d * hj * 0.95, -hj * 1.62);
      ctx.lineTo(d * hj * 0.78, -hj * 1.52);
      ctx.stroke();
    });
    ctx.lineCap = "butt";

    // Sete
    ctx.fillStyle = "#1c1d2e";
    avrundet(-hj * 0.22, -hj * 1.5, hj * 0.44, hj * 0.16, hj * 0.08);
    ctx.fill();

    // Bein som tråkker – føttene følger pedalene på hver side av hjulet
    ctx.strokeStyle = "#2f4bbd";
    ctx.lineWidth = Math.max(1.8, hj * 0.13);
    ctx.lineCap = "round";
    [0, Math.PI].forEach((fase, i) => {
      const v = spiller.tramp * 0.6 + fase;
      const d = i ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(d * hj * 0.16, -hj * 1.42);
      ctx.lineTo(d * (felgB + hj * 0.1), -hj * 0.62 + Math.sin(v) * hj * 0.16);
      ctx.stroke();
    });
    ctx.lineCap = "butt";

    // Med gassen inne dukker rytteren seg ned over styret
    const duk = hj * 0.22 * gassNivå;

    // Armer ned mot styret
    ctx.strokeStyle = "#f5c93f";
    ctx.lineWidth = Math.max(2, hj * 0.15);
    ctx.lineCap = "round";
    [-1, 1].forEach(d => {
      ctx.beginPath();
      ctx.moveTo(d * hj * 0.34, -hj * 2.25 + duk);
      ctx.lineTo(d * hj * 0.8, -hj * 1.6);
      ctx.stroke();
    });
    ctx.lineCap = "butt";

    // Overkropp
    ctx.fillStyle = "#ffd44d";
    avrundet(-hj * 0.42, -hj * 2.45 + duk, hj * 0.84, hj * 1.1, hj * 0.26);
    ctx.fill();
    ctx.fillStyle = "#e8b93a";
    ctx.fillRect(-hj * 0.42, -hj * 1.98 + duk, hj * 0.84, hj * 0.16);

    // Hjelm
    ctx.fillStyle = "#f0f2fa";
    ctx.beginPath();
    ctx.arc(0, -hj * 2.75 + duk, hj * 0.42, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9cde3";
    ctx.fillRect(-hj * 0.42, -hj * 2.78 + duk, hj * 0.84, hj * 0.16);
    ctx.fillStyle = "#e7b58c";
    ctx.beginPath();
    ctx.arc(0, -hj * 2.6 + duk, hj * 0.34, 0, Math.PI);
    ctx.fill();

    ctx.restore();
  }

  /** Striper som suser forbi når gassen er inne – ren fartsfølelse. */
  function tegnFartslinjer() {
    if (gassNivå <= 0.03) return;
    const cx = bredde / 2;
    const cy = horisont + (hoyde - horisont) * 0.3;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(1.5, bredde * 0.0045);
    ctx.lineCap = "round";
    for (let i = 0; i < 16; i++) {
      const v = frø(i * 13 + 3) * Math.PI * 2;
      const fase = (tid * 1.9 + frø(i * 7 + 1)) % 1;
      const r = (0.12 + fase) * bredde * 0.62;
      const len = bredde * (0.03 + fase * 0.06);
      ctx.globalAlpha = gassNivå * Math.min(1, fase * 4) * (1 - fase) * 0.85;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(v) * r, cy + Math.sin(v) * r * 0.72);
      ctx.lineTo(cx + Math.cos(v) * (r + len), cy + Math.sin(v) * (r + len) * 0.72);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";
  }

  function tegnPartikler() {
    partikler.forEach(p => {
      ctx.globalAlpha = klem(1 - p.alder / p.liv, 0, 1);
      ctx.fillStyle = p.farge;
      ctx.fillRect(p.x - p.størrelse / 2, p.y - p.størrelse / 2, p.størrelse, p.størrelse);
    });
    ctx.globalAlpha = 1;
  }

  function tegnMeldinger() {
    meldinger.forEach(m => {
      const t = m.alder / m.liv;
      ctx.globalAlpha = klem(1 - Math.pow(t, 3), 0, 1);
      const px = Math.max(22, bredde * 0.065);
      ctx.font = "900 " + px + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      const y = hoyde * 0.32 - t * hoyde * 0.1;
      ctx.lineWidth = px * 0.22;
      ctx.strokeStyle = "rgba(12,14,34,.75)";
      ctx.strokeText(m.tekst, bredde / 2, y);
      ctx.fillStyle = m.farge;
      ctx.fillText(m.tekst, bredde / 2, y);
      ctx.textAlign = "start";
      ctx.globalAlpha = 1;
    });
  }

  /* ── Løkke ────────────────────────────────────────────────────────────── */

  function steg(nå) {
    raf = requestAnimationFrame(steg);
    if (lerret.clientWidth !== bredde || lerret.clientHeight !== hoyde) tilpassStørrelse();
    if (!forrigeTid) forrigeTid = nå;
    const dt = Math.min(0.05, (nå - forrigeTid) / 1000);
    forrigeTid = nå;
    if (!pauset && kjører) oppdater(dt);
    else if (!kjører) oppdaterPynt(dt);
    tegn();
  }

  return { start, stopp, forhåndsvis, styr, hopp, gass, settPause, settLyd, tilpassStørrelse };
})();
