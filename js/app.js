/*
 * VerbLab – app-logikk
 * ----------------------------------------------------------------------------
 * Skjermer: hjem · økt (øving/test) · resultat · fremgang
 */

(() => {
  "use strict";

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const UKER = VERB_CONFIG.uker.filter(u => u.verb && u.verb.length);
  if (!UKER.length) {
    document.body.innerHTML = "<p style='padding:2rem'>Ingen verb funnet i <code>js/config.js</code>.</p>";
    return;
  }

  const SKJERMER = ["hjem", "okt", "spill", "resultat", "fremgang"];
  const MODUSNAVN = { skriv: "Skrivemodus", flervalg: "Flervalg", spill: "Sykkelløypa" };
  const HINT_KOST = 0.5;   // poeng som trekkes når du bruker hint på et verb

  let valgtUkeId = Progress.innstilling("sisteUke");
  if (!UKER.some(u => u.id === valgtUkeId)) valgtUkeId = UKER[0].id;

  let økt = null;        // aktiv øvings- eller testøkt
  let sisteOppsett = null; // for «Ta på nytt»

  /* ── Hjelpere ─────────────────────────────────────────────────────────── */

  const valgtUke = () => UKER.find(u => u.id === valgtUkeId) || UKER[0];

  const bland = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const normaliser = s => String(s || "")
    .toLowerCase()
    .replace(/[.,!?;:]/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();

  /** Godtar hele fasiten ("was/were") og hvert alternativ for seg. */
  function erRiktig(fasit, svar) {
    const s = normaliser(svar);
    if (!s) return false;
    const godkjent = [normaliser(fasit), ...fasit.split("/").map(normaliser)];
    return godkjent.includes(s);
  }

  const prosent = (del, av) => (av ? Math.round((del / av) * 100) : 0);

  const poengTekst = p => String(Math.round(p * 10) / 10).replace(".", ",");

  function toast(tekst) {
    const el = $("#toast");
    el.textContent = tekst;
    el.hidden = false;
    el.classList.add("vis");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.classList.remove("vis");
      setTimeout(() => { el.hidden = true; }, 250);
    }, 2200);
  }

  function datoTekst(ms) {
    const d = new Date(ms);
    return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short" }) +
      " " + d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  }

  function varighet(sek) {
    const m = Math.floor(sek / 60), s = sek % 60;
    return m ? `${m} min ${s} s` : `${s} s`;
  }

  /* ── Navigasjon ───────────────────────────────────────────────────────── */

  function visSkjerm(navn) {
    SKJERMER.forEach(s => { $("#screen-" + s).hidden = s !== navn; });
    $$(".tab").forEach(t => {
      const aktiv = t.dataset.nav === navn ||
        ((navn === "okt" || navn === "spill") && økt !== null && t.dataset.nav === økt.modus);
      t.classList.toggle("aktiv", aktiv);
      if (aktiv) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
  }

  function naviger(mål) {
    if (MODUSNAVN[mål]) {
      startModus(mål, valgtUke());
      return;
    }
    if (økt && økt.modus === "spill") Sykkelspill.stopp();
    økt = null;
    if (mål === "hjem") tegnHjem();
    if (mål === "fremgang") tegnFremgang();
    visSkjerm(mål);
  }

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-nav]");
    if (!el) return;
    e.preventDefault();
    naviger(el.dataset.nav);
  });

  /* ── Hjem ─────────────────────────────────────────────────────────────── */

  function tegnHjem() {
    const liste = $("#weekList");
    liste.innerHTML = "";

    UKER.forEach(uke => {
      const andel = Progress.ukeMestring(uke);
      const li = document.createElement("li");
      li.innerHTML = `
        <button type="button" class="week ${uke.id === valgtUkeId ? "valgt" : ""}" data-uke="${uke.id}">
          <span class="week-top">
            <span class="week-name">${uke.navn}</span>
            <span class="week-pct">${prosent(andel, 1)} %</span>
          </span>
          <span class="meter"><span style="width:${andel * 100}%"></span></span>
          <span class="week-sub">${uke.verb.length} verb · ${uke.verb.filter(v => Progress.erMestret(uke.id, v[0])).length} mestret</span>
        </button>`;
      liste.appendChild(li);
    });

    liste.querySelectorAll("[data-uke]").forEach(btn => {
      btn.addEventListener("click", () => {
        valgtUkeId = btn.dataset.uke;
        Progress.innstilling("sisteUke", valgtUkeId);
        tegnHjem();
      });
    });

    const uke = valgtUke();
    const andel = Progress.ukeMestring(uke);
    const beste = Progress.besteØkt(uke.id);
    $("#startWeekName").textContent = uke.navn;
    $("#startWeekBar").style.width = andel * 100 + "%";
    $("#startWeekMeta").textContent =
      `${uke.verb.length} verb · ${prosent(andel, 1)} % mestret` +
      (beste ? ` · beste økt ${prosent(beste.poeng, beste.totalt)} %` : " · ingen økt fullført");
  }

  /* ── Økt ──────────────────────────────────────────────────────────────── */

  const tilOppgave = (ukeId, v) => ({
    ukeId, infinitiv: v[0], preteritum: v[1], partisipp: v[2], norsk: v[3]
  });

  const lagOppgaver = uke => uke.verb.map(v => tilOppgave(uke.id, v));

  /** Alle verb på tvers av uker – brukes til å lage svaralternativer. */
  const ALLE_VERB = UKER.flatMap(lagOppgaver);

  /** Felles inngang – sykkelløypa har sin egen skjerm, de to andre deler økt-skjermen. */
  function startModus(modus, uke, egneOppgaver) {
    if (modus === "spill") startSpill(uke, egneOppgaver);
    else startØkt(modus, uke, egneOppgaver);
  }

  /** Verbene i en økt: blandet, og kuttet til valgt antall når hele uka brukes. */
  function velgOppgaver(uke, egneOppgaver) {
    let oppgaver = bland(egneOppgaver || lagOppgaver(uke));
    const antall = $("#testCount").value;
    if (!egneOppgaver && antall !== "all") {
      oppgaver = oppgaver.slice(0, Math.min(Number(antall), oppgaver.length));
    }
    return oppgaver;
  }

  function startØkt(modus, uke, egneOppgaver) {
    const oppgaver = velgOppgaver(uke, egneOppgaver);
    if (!oppgaver.length) { toast("Ingen verb å øve på."); return; }

    sisteOppsett = { modus, uke, egneOppgaver };
    økt = {
      modus,
      ukeNavn: uke.navn,
      ukeId: uke.id,
      kø: oppgaver.slice(),
      totalt: oppgaver.length,
      ferdige: 0,
      poeng: 0,
      hintAntall: 0,
      feilListe: [],
      start: Date.now(),
      fase: "svar",
      hintBrukt: false
    };

    $("#sessionMode").textContent = MODUSNAVN[modus];
    $("#sessionMode").className = "badge badge-" + modus;
    $("#sessionWeek").textContent = uke.navn;

    visSkjerm("okt");
    visOppgave();
  }

  function visOppgave() {
    const o = økt.kø[0];
    const erValg = økt.modus === "flervalg";

    økt.fase = "svar";
    økt.hintBrukt = false;

    $("#qWord").textContent = o.infinitiv;
    $("#qTranslation").textContent = o.norsk;
    $("#qKicker").textContent = erValg ? "Velg riktig bøying" : "Bøy verbet";

    $("#qAnswers").hidden = erValg;
    $("#qChoices").hidden = !erValg;
    $("#qHint").hidden = erValg;
    $("#qHint").disabled = false;

    ["#qPast", "#qPart"].forEach(sel => {
      const inp = $(sel);
      inp.value = "";
      inp.readOnly = false;
      inp.classList.remove("riktig", "feil");
    });
    $("#qPastNote").textContent = "";
    $("#qPartNote").textContent = "";
    $("#qFeedback").hidden = true;
    $("#qFeedback").className = "feedback";

    if (erValg) tegnAlternativer(o);

    $("#qSubmit").textContent = "Sjekk";
    $("#qSubmit").disabled = erValg;   // låses opp når begge formene er valgt

    oppdaterØktStatus();
    if (!erValg && window.matchMedia("(min-width: 768px)").matches) $("#qPast").focus();
  }

  /* Svaralternativer (flervalg) – én gruppe per form */

  function regelrettForm(infinitiv) {
    if (/e$/.test(infinitiv)) return infinitiv + "d";
    if (/[^aeiou]y$/.test(infinitiv)) return infinitiv.slice(0, -1) + "ied";
    return infinitiv + "ed";
  }

  /**
   * Fire alternativer for én form: fasiten pluss tre distraktorer.
   * Kandidatene er verbets egen andre form, den regelrette -ed-fella og
   * samme form fra andre verb – helst fra samme uke.
   */
  function lagAlternativer(o, felt, antall = 4) {
    const form = v => (felt === "preteritum" ? v.preteritum : v.partisipp);
    const fasit = form(o);
    const andreFormen = felt === "preteritum" ? o.partisipp : o.preteritum;

    const andre = bland(ALLE_VERB.filter(v => v.infinitiv !== o.infinitiv));
    const sammeUke = andre.filter(v => v.ukeId === o.ukeId);
    const naboer = sammeUke.length >= 3 ? sammeUke : andre;

    const pool = bland([andreFormen, regelrettForm(o.infinitiv)].concat(naboer.slice(0, 6).map(form)));
    andre.map(form).forEach(f => pool.push(f));   // reserve hvis noe blir filtrert bort

    const sett = new Set([normaliser(fasit)]);
    const valgte = [{ tekst: fasit, riktig: true }];
    pool.forEach(f => {
      const n = normaliser(f);
      if (valgte.length < antall && f && !sett.has(n)) {
        sett.add(n);
        valgte.push({ tekst: f, riktig: false });
      }
    });

    return bland(valgte);
  }

  function tegnAlternativer(o) {
    økt.valg = { past: null, part: null };
    byggGruppe("#qChoicesPast", "past", lagAlternativer(o, "preteritum"), 0);
    byggGruppe("#qChoicesPart", "part", lagAlternativer(o, "partisipp"), 4);
    $("#qChoicePastNote").textContent = "";
    $("#qChoicePastNote").className = "field-note";
    $("#qChoicePartNote").textContent = "";
    $("#qChoicePartNote").className = "field-note";
  }

  function byggGruppe(sel, gruppe, alternativer, nummerFra) {
    const boks = $(sel);
    boks.innerHTML = "";
    alternativer.forEach((alt, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.innerHTML = `<span class="choice-num">${nummerFra + i + 1}</span><span class="choice-text"></span>`;
      b.querySelector(".choice-text").textContent = alt.tekst;
      b.addEventListener("click", () => velgAlternativ(gruppe, alt, b));
      if (alt.riktig) b.dataset.fasit = "1";
      boks.appendChild(b);
    });
  }

  function velgAlternativ(gruppe, alt, knapp) {
    if (!økt || økt.fase !== "svar") return;
    Array.from(knapp.parentNode.children).forEach(b => b.classList.remove("valgt"));
    knapp.classList.add("valgt");
    økt.valg[gruppe] = alt;
    $("#qSubmit").disabled = !(økt.valg.past && økt.valg.part);
  }

  function sjekkFlervalg() {
    if (!økt.valg.past || !økt.valg.part) return;
    const o = økt.kø[0];
    const pastOk = !!økt.valg.past.riktig;
    const partOk = !!økt.valg.part.riktig;
    const alleOk = pastOk && partOk;

    merkGruppe("#qChoicesPast", "#qChoicePastNote", pastOk, o.preteritum);
    merkGruppe("#qChoicesPart", "#qChoicePartNote", partOk, o.partisipp);

    // Flervalg teller i statistikken, men bygger ikke mestringsrekka.
    if (!o.gjentakelse) {
      Progress.registrer(o.ukeId, o.infinitiv, alleOk, false);
      if (alleOk) økt.poeng++;
      else økt.feilListe.push({
        oppgave: o,
        svarPast: økt.valg.past.tekst,
        svarPart: økt.valg.part.tekst,
        pastOk, partOk
      });
    }

    const fb = $("#qFeedback");
    fb.hidden = false;
    fb.className = "feedback " + (alleOk ? "ok" : "nei");
    if (alleOk) fb.textContent = "Riktig!";
    else fb.innerHTML = `Fasit: <strong>${o.infinitiv} – ${o.preteritum} – ${o.partisipp}</strong>`;

    økt.fase = "fasit";
    økt.sisteRiktig = alleOk;
    $("#qSubmit").textContent = økt.ferdige === økt.totalt - 1 ? "Fullfør" : "Neste";
    oppdaterØktStatus();
  }

  function merkGruppe(sel, noteSel, ok, fasit) {
    $$(sel + " .choice").forEach(b => {
      b.disabled = true;
      if (b.dataset.fasit) b.classList.add(b.classList.contains("valgt") ? "riktig" : "fasit");
      else if (b.classList.contains("valgt")) b.classList.add("feil");
    });
    $(noteSel).textContent = ok ? "✓ riktig" : "✗ riktig svar: " + fasit;
    $(noteSel).className = "field-note " + (ok ? "ok" : "nei");
  }

  function oppdaterØktStatus() {
    $("#sessionCounter").textContent = `${økt.ferdige} / ${økt.totalt}`;
    $("#sessionScore").textContent = `${poengTekst(økt.poeng)} poeng`;
    $("#sessionBar").style.width = prosent(økt.ferdige, økt.totalt) + "%";
  }

  function sjekkSvar() {
    const o = økt.kø[0];
    const svarPast = $("#qPast").value;
    const svarPart = $("#qPart").value;
    const pastOk = erRiktig(o.preteritum, svarPast);
    const partOk = erRiktig(o.partisipp, svarPart);
    const alleOk = pastOk && partOk;
    const poeng = alleOk ? (økt.hintBrukt ? 1 - HINT_KOST : 1) : 0;

    // Statistikk og poeng: bare første gang et verb møtes i økta.
    if (!o.gjentakelse) {
      Progress.registrer(o.ukeId, o.infinitiv, alleOk && !økt.hintBrukt);
      økt.poeng += poeng;
      if (økt.hintBrukt) økt.hintAntall++;
      if (!alleOk) økt.feilListe.push({
        oppgave: o,
        svarPast: svarPast.trim(),
        svarPart: svarPart.trim(),
        pastOk, partOk
      });
    }

    merkFelt("#qPast", "#qPastNote", pastOk, o.preteritum);
    merkFelt("#qPart", "#qPartNote", partOk, o.partisipp);

    const fb = $("#qFeedback");
    fb.hidden = false;
    if (alleOk && økt.hintBrukt) {
      fb.className = "feedback halv";
      fb.textContent = `Riktig – men hint koster ${poengTekst(HINT_KOST)} poeng, så verbet kommer igjen.`;
    } else if (alleOk) {
      fb.className = "feedback ok";
      fb.textContent = "Riktig! +1 poeng";
    } else {
      fb.className = "feedback nei";
      fb.innerHTML = `Fasit: <strong>${o.infinitiv} – ${o.preteritum} – ${o.partisipp}</strong>`;
    }

    $("#qHint").disabled = true;
    $("#qSubmit").textContent = økt.ferdige === økt.totalt - 1 ? "Fullfør" : "Neste";
    økt.fase = "fasit";
    økt.sisteRiktig = alleOk && !økt.hintBrukt;
    oppdaterØktStatus();
  }

  function merkFelt(inputSel, noteSel, ok, fasit) {
    const inp = $(inputSel);
    inp.classList.add(ok ? "riktig" : "feil");
    inp.readOnly = true;
    $(noteSel).textContent = ok ? "✓ riktig" : "✗ riktig svar: " + fasit;
    $(noteSel).className = "field-note " + (ok ? "ok" : "nei");
  }

  function nesteOppgave(riktig) {
    const o = økt.kø.shift();

    if (!riktig) {
      // Feil (eller hint brukt) → verbet dukker opp igjen senere i økta.
      økt.kø.splice(Math.min(3, økt.kø.length), 0, Object.assign({}, o, { gjentakelse: true }));
    } else {
      økt.ferdige++;
    }

    if (!økt.kø.length) { avsluttØkt(); return; }
    visOppgave();
  }

  function avsluttØkt() {
    const sekunder = Math.max(1, Math.round((Date.now() - økt.start) / 1000));
    const resultat = {
      modus: økt.modus,
      ukeId: økt.ukeId,
      ukeNavn: økt.ukeNavn,
      poeng: økt.poeng,
      totalt: økt.totalt,
      hintAntall: økt.hintAntall,
      sekunder,
      feilListe: økt.feilListe
    };
    Progress.lagreØkt({
      ukeId: resultat.ukeId,
      ukeNavn: resultat.ukeNavn,
      modus: resultat.modus,
      poeng: resultat.poeng,
      totalt: resultat.totalt,
      sekunder
    });
    økt = null;
    visResultat(resultat);
  }

  /* Skjema-hendelser */

  $("#qForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!økt) return;
    if (økt.fase === "fasit") nesteOppgave(økt.sisteRiktig);
    else if (økt.modus === "flervalg") sjekkFlervalg();
    else sjekkSvar();
  });

  $("#qPast").addEventListener("keydown", e => {
    if (e.key === "Enter" && økt && økt.fase === "svar" && !$("#qPart").value.trim()) {
      e.preventDefault();
      $("#qPart").focus();
    }
  });

  $("#qHint").addEventListener("click", () => {
    if (!økt || økt.fase !== "svar") return;
    const o = økt.kø[0];
    økt.hintBrukt = true;
    $("#qPastNote").textContent = "Starter på: " + o.preteritum.slice(0, 2) + "…";
    $("#qPastNote").className = "field-note hint";
    $("#qPartNote").textContent = "Starter på: " + o.partisipp.slice(0, 2) + "…";
    $("#qPartNote").className = "field-note hint";
    $("#qHint").disabled = true;
  });

  document.addEventListener("keydown", e => {
    if (!økt || økt.modus !== "flervalg" || økt.fase !== "svar") return;
    if (e.key < "1" || e.key > "8" || e.metaKey || e.ctrlKey || e.altKey) return;
    const knapp = $$("#qChoices .choice")[Number(e.key) - 1];
    if (knapp) { e.preventDefault(); knapp.click(); }
  });

  $("#qQuit").addEventListener("click", () => {
    if (!økt) { naviger("hjem"); return; }
    if (økt.ferdige > 0 && !confirm("Avslutte økta? Resultatet blir ikke lagret.")) return;
    økt = null;
    naviger("hjem");
  });

  /* ── Sykkelløypa (spillmodus) ─────────────────────────────────────────── */

  /*
   * Spillet stiller ett spørsmål om gangen: først preteritum, så partisipp av
   * samme verb. Begge må være riktige for at verbet skal gi poeng – samme regel
   * som i flervalg, og som der teller svarene i statistikken uten å bygge
   * mestring (å treffe riktig skilt er gjenkjenning, ikke å produsere formen).
   */

  const FORMER = [
    { felt: "preteritum", navn: "Preteritum" },
    { felt: "partisipp", navn: "Perfektum partisipp" }
  ];

  let spillLyd = Progress.innstilling("spillLyd") !== false;

  function startSpill(uke, egneOppgaver) {
    const oppgaver = velgOppgaver(uke, egneOppgaver);
    if (!oppgaver.length) { toast("Ingen verb å øve på."); return; }

    Sykkelspill.stopp();
    sisteOppsett = { modus: "spill", uke, egneOppgaver };
    økt = {
      modus: "spill",
      ukeNavn: uke.navn,
      ukeId: uke.id,
      kø: oppgaver.slice(),
      totalt: oppgaver.length,
      ferdige: 0,
      poeng: 0,
      hintAntall: 0,
      feilListe: [],
      start: Date.now(),
      formNr: 0,
      delsvar: {}
    };

    $("#gameKicker").textContent = "Klar?";
    $("#gameKicker").dataset.form = "preteritum";
    $("#gameAv").hidden = true;
    $("#gameWord").textContent = uke.navn;
    $("#gameNo").textContent = oppgaver.length + " verb";
    $("#gameLead").textContent =
      `${uke.navn} · ${oppgaver.length} verb. Tre skilt kommer mot deg – styr inn i det med riktig bøyning.`;
    oppdaterSpillStatus();
    $("#gameOverlay").hidden = false;
    settLydIkon();

    visSkjerm("spill");
    Sykkelspill.forhåndsvis($("#gameCanvas"));   // stillbilde bak startkortet
  }

  function kjørSpill() {
    $("#gameOverlay").hidden = true;
    økt.start = Date.now();
    Sykkelspill.start({
      lerret: $("#gameCanvas"),
      lyd: spillLyd,
      hentRunde: spillHentRunde,
      påResultat: spillResultat,
      påFerdig: spillFerdig
    });
  }

  function oppdaterSpillStatus() {
    if (!økt) return;
    $("#gameCounter").textContent = `${økt.ferdige} / ${økt.totalt}`;
    $("#gameScore").textContent = `${poengTekst(økt.poeng)} poeng`;
    $("#gameBar").style.width = prosent(økt.ferdige, økt.totalt) + "%";
  }

  function spillHentRunde() {
    if (!økt || !økt.kø.length) return null;
    const o = økt.kø[0];
    const form = FORMER[økt.formNr];
    const fasit = form.felt === "preteritum" ? o.preteritum : o.partisipp;

    $("#gameKicker").textContent = form.navn;
    $("#gameKicker").dataset.form = form.felt;
    $("#gameAv").hidden = false;
    $("#gameWord").textContent = o.infinitiv;
    $("#gameNo").textContent = o.norsk;
    oppdaterSpillStatus();

    return {
      ord: o.infinitiv,
      norsk: o.norsk,
      form: form.navn,
      fasit,
      alternativer: lagAlternativer(o, form.felt, 3)
    };
  }

  function spillResultat(runde, alt, status) {
    if (!økt) return;
    const o = økt.kø[0];
    const form = FORMER[økt.formNr];
    økt.delsvar[form.felt] = { ok: status === "riktig", svar: alt ? alt.tekst : "–" };

    if (økt.formNr < FORMER.length - 1) {   // samme verb, neste form
      økt.formNr++;
      return;
    }

    const pastOk = økt.delsvar.preteritum.ok;
    const partOk = økt.delsvar.partisipp.ok;
    const alleOk = pastOk && partOk;

    // Statistikk og poeng bare første gang verbet møtes i økta.
    if (!o.gjentakelse) {
      Progress.registrer(o.ukeId, o.infinitiv, alleOk, false);
      if (alleOk) økt.poeng++;
      else økt.feilListe.push({
        oppgave: o,
        svarPast: økt.delsvar.preteritum.svar,
        svarPart: økt.delsvar.partisipp.svar,
        pastOk, partOk
      });
    }

    økt.kø.shift();
    if (alleOk) økt.ferdige++;
    else økt.kø.splice(Math.min(3, økt.kø.length), 0, Object.assign({}, o, { gjentakelse: true }));

    økt.formNr = 0;
    økt.delsvar = {};
    oppdaterSpillStatus();
  }

  function spillFerdig() {
    Sykkelspill.stopp();
    if (økt) avsluttØkt();
  }

  function avsluttSpill() {
    if (!økt) { naviger("hjem"); return; }
    Sykkelspill.settPause(true);
    if (økt.ferdige > 0 && !confirm("Avslutte løpet? Resultatet blir ikke lagret.")) {
      Sykkelspill.settPause(false);
      return;
    }
    Sykkelspill.stopp();
    økt = null;
    naviger("hjem");
  }

  function settLydIkon() {
    const b = $("#gameSound");
    b.textContent = spillLyd ? "🔊" : "🔇";
    b.setAttribute("aria-pressed", String(spillLyd));
  }

  $("#gameStart").addEventListener("click", kjørSpill);
  $("#gameBack").addEventListener("click", () => { økt = null; naviger("hjem"); });
  $("#gameQuit").addEventListener("click", avsluttSpill);
  $("#gameLeft").addEventListener("click", () => Sykkelspill.styr(-1));
  $("#gameRight").addEventListener("click", () => Sykkelspill.styr(1));
  $("#gameJump").addEventListener("click", () => Sykkelspill.hopp());

  // Fartsknappen holdes inne – både mus og berøring, og slippes uansett hvor
  // fingeren havner.
  const fartPå = e => { e.preventDefault(); Sykkelspill.gass(true); };
  const fartAv = () => Sykkelspill.gass(false);
  $("#gameFast").addEventListener("pointerdown", fartPå);
  ["pointerup", "pointercancel", "pointerleave"].forEach(navn =>
    $("#gameFast").addEventListener(navn, fartAv));
  window.addEventListener("pointerup", fartAv);
  $("#gameSound").addEventListener("click", () => {
    spillLyd = !spillLyd;
    Progress.innstilling("spillLyd", spillLyd);
    Sykkelspill.settLyd(spillLyd);
    settLydIkon();
  });

  // Pause spillet når fanen legges i bakgrunnen, så ingenting skjer usett.
  document.addEventListener("visibilitychange", () => {
    if (økt && økt.modus === "spill" && document.hidden) Sykkelspill.settPause(true);
  });
  window.addEventListener("blur", () => {
    if (økt && økt.modus === "spill") Sykkelspill.settPause(true);
  });
  // …og la det gå igjen så snart vinduet er i bruk.
  const fortsettSpill = () => {
    if (økt && økt.modus === "spill" && !document.hidden) Sykkelspill.settPause(false);
  };
  window.addEventListener("focus", fortsettSpill);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) fortsettSpill(); });
  $("#gameCanvas").addEventListener("pointerdown", fortsettSpill);

  /* ── Resultat ─────────────────────────────────────────────────────────── */

  function visResultat(r) {
    const pct = prosent(r.poeng, r.totalt);
    $("#scoreRing").style.setProperty("--pct", pct);
    $("#scoreRing").dataset.niva = pct >= 80 ? "bra" : pct >= 50 ? "ok" : "svak";
    $("#scorePct").textContent = pct + " %";
    $("#scoreFrac").textContent = `${poengTekst(r.poeng)} / ${r.totalt} poeng`;

    $("#resultTitle").textContent =
      pct === 100 ? "Full pott! 🎉" : pct >= 80 ? "Bra jobba!" : pct >= 50 ? "På god vei" : "Dette må øves mer på";
    $("#resultSub").textContent =
      `${MODUSNAVN[r.modus]} · ${r.ukeNavn} · ${varighet(r.sekunder)}` +
      (r.hintAntall ? ` · ${r.hintAntall} hint (−${poengTekst(r.hintAntall * HINT_KOST)} p)` : "") +
      " · lagret i fremgang";

    const wrap = $("#resultWrongWrap");
    const ul = $("#resultWrong");
    ul.innerHTML = "";
    wrap.hidden = !r.feilListe.length;
    r.feilListe.forEach(f => {
      const o = f.oppgave;
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="miss-word">${o.infinitiv} <span class="miss-no">${o.norsk}</span></div>
        <div class="miss-answer">Fasit: <strong>${o.preteritum} – ${o.partisipp}</strong></div>
        <div class="miss-yours">Du svarte: ${(f.svarPast || "–")} – ${(f.svarPart || "–")}</div>`;
      ul.appendChild(li);
    });

    $("#resultRetryWrong").hidden = !r.feilListe.length;
    $("#resultRetryWrong").onclick = () => {
      startModus(r.modus, { id: r.ukeId, navn: r.ukeNavn + " – feilene" },
        r.feilListe.map(f => Object.assign({}, f.oppgave, { gjentakelse: false })));
    };
    $("#resultAgain").onclick = () => {
      if (sisteOppsett) startModus(sisteOppsett.modus, sisteOppsett.uke, sisteOppsett.egneOppgaver);
    };

    visSkjerm("resultat");
  }

  /* ── Fremgang ─────────────────────────────────────────────────────────── */

  function tegnFremgang() {
    const t = Progress.totalt(UKER);
    const økter = Progress.økter();

    $("#statGrid").innerHTML = [
      ["Mestrede verb", `${t.mestret} <small>/ ${t.verb}</small>`],
      ["Treffprosent", prosent(t.riktig, t.svar) + " %"],
      ["Verb påbegynt", `${t.sett} <small>/ ${t.verb}</small>`],
      ["Økter fullført", String(økter.length)]
    ].map(([navn, verdi]) => `
      <div class="stat">
        <span class="stat-value">${verdi}</span>
        <span class="stat-label">${navn}</span>
      </div>`).join("");

    $("#progressWeeks").innerHTML = UKER.map(uke => {
      const andel = Progress.ukeMestring(uke);
      const beste = Progress.besteØkt(uke.id);
      return `
        <li>
          <div class="pw-top">
            <span>${uke.navn}</span>
            <span class="pw-pct">${prosent(andel, 1)} %</span>
          </div>
          <span class="meter"><span style="width:${andel * 100}%"></span></span>
          <div class="pw-sub">${uke.verb.filter(v => Progress.erMestret(uke.id, v[0])).length} av ${uke.verb.length} mestret${beste ? ` · beste økt ${prosent(beste.poeng, beste.totalt)} %` : ""}</div>
        </li>`;
    }).join("");

    const harde = Progress.vanskeligste(UKER, 10);
    $("#hardList").innerHTML = harde.length
      ? harde.map(r => `
        <li>
          <div class="miss-word">${r.verb[0]} <span class="miss-no">${r.verb[3]}</span></div>
          <div class="miss-answer">${r.verb[1]} – ${r.verb[2]}</div>
          <div class="miss-yours">${r.stat.feil} feil · ${r.stat.riktig} riktige · ${r.uke.navn}</div>
        </li>`).join("")
      : `<li class="tom">Ingen bom registrert ennå. 👏</li>`;

    const hardBtn = $("#practiceHard");
    hardBtn.hidden = !harde.length;
    hardBtn.onclick = () => startModus("skriv", { id: "vanskelige", navn: "Vanskelige verb" },
      harde.map(r => ({
        ukeId: r.uke.id, infinitiv: r.verb[0], preteritum: r.verb[1],
        partisipp: r.verb[2], norsk: r.verb[3]
      })));

    $("#testLog").innerHTML = økter.length
      ? økter.slice(0, 12).map(t => {
          const p = prosent(t.poeng, t.totalt);
          return `
            <li>
              <span class="tl-pct" data-niva="${p >= 80 ? "bra" : p >= 50 ? "ok" : "svak"}">${p} %</span>
              <span class="tl-main">
                <strong>${t.ukeNavn}</strong>
                <small>${poengTekst(t.poeng)} av ${t.totalt} poeng · ${MODUSNAVN[t.modus] || "Skrivemodus"} · ${varighet(t.sekunder)}</small>
              </span>
              <span class="tl-date">${datoTekst(t.tid)}</span>
            </li>`;
        }).join("")
      : `<li class="tom">Ingen økter fullført ennå.</li>`;
  }

  $("#resetProgress").addEventListener("click", () => {
    if (!confirm("Slette all fremgang? Dette kan ikke angres.")) return;
    Progress.nullstill();
    valgtUkeId = UKER[0].id;
    tegnFremgang();
    toast("Fremgangen er nullstilt.");
  });

  $("#testCount").addEventListener("change", e => Progress.innstilling("antallIØkt", e.target.value));

  /* ── Oppstart ─────────────────────────────────────────────────────────── */

  const lagretAntall = Progress.innstilling("antallIØkt");
  if (lagretAntall) $("#testCount").value = lagretAntall;

  tegnHjem();
  visSkjerm("hjem");
})();
