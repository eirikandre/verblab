/*
 * VerbLab – lagring av fremgang (localStorage)
 * ----------------------------------------------------------------------------
 * Datamodell:
 *   verb:   { "<ukeId>::<infinitiv>": { riktig, feil, rekke, sistSett } }
 *   tester: [ { ukeId, ukeNavn, modus, poeng, totalt, sekunder, tid } ]
 *
 * Poeng er ikke nødvendigvis heltall: hint gir halv uttelling.
 */

const Progress = (() => {
  const KEY = "verblab.fremgang.v1";
  const MESTRET_REKKE = 3;   // riktige på rad før et verb regnes som mestret

  const tomState = () => ({ verb: {}, tester: [], innstillinger: {} });

  let state = les();

  function les() {
    try {
      const rå = localStorage.getItem(KEY);
      if (!rå) return tomState();
      const data = JSON.parse(rå);
      return Object.assign(tomState(), data);
    } catch (e) {
      console.warn("Kunne ikke lese fremgang, starter på nytt.", e);
      return tomState();
    }
  }

  function skriv() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Kunne ikke lagre fremgang.", e);
    }
  }

  const nøkkel = (ukeId, infinitiv) => ukeId + "::" + infinitiv;

  function forVerb(ukeId, infinitiv) {
    return state.verb[nøkkel(ukeId, infinitiv)] || { riktig: 0, feil: 0, rekke: 0, sistSett: null };
  }

  /**
   * Registrer ett svar. `riktig` = begge former riktig på første forsøk.
   * `tellerMestring` = false for flervalg: svaret teller i statistikken, men
   * bygger ikke mestringsrekka (det krever at du skriver formene selv).
   */
  function registrer(ukeId, infinitiv, riktig, tellerMestring = true) {
    const k = nøkkel(ukeId, infinitiv);
    const s = state.verb[k] || { riktig: 0, feil: 0, rekke: 0, sistSett: null };
    if (riktig) {
      s.riktig++;
      if (tellerMestring) s.rekke++;
    } else {
      s.feil++;
      s.rekke = 0;
    }
    s.sistSett = Date.now();
    state.verb[k] = s;
    skriv();
  }

  const erMestret = (ukeId, infinitiv) => forVerb(ukeId, infinitiv).rekke >= MESTRET_REKKE;

  /** Andel mestrede verb i en uke, 0–1. */
  function ukeMestring(uke) {
    if (!uke.verb.length) return 0;
    const n = uke.verb.filter(v => erMestret(uke.id, v[0])).length;
    return n / uke.verb.length;
  }

  function lagreØkt(resultat) {
    state.tester.unshift(Object.assign({ tid: Date.now() }, resultat));
    state.tester = state.tester.slice(0, 50);
    skriv();
  }

  /** `riktig` er feltnavnet fra eldre lagringer – leses som poeng. */
  const normaliser = t => Object.assign({}, t, { poeng: t.poeng !== undefined ? t.poeng : t.riktig });

  const økter = (ukeId) => state.tester
    .filter(t => !ukeId || t.ukeId === ukeId)
    .map(normaliser);

  const andel = t => (t.totalt ? t.poeng / t.totalt : 0);

  function besteØkt(ukeId) {
    const liste = økter(ukeId).filter(t => t.totalt > 0);
    if (!liste.length) return null;
    return liste.reduce((a, b) => (andel(b) > andel(a) ? b : a));
  }

  /** Verb sortert etter hvor dårlig de sitter (flest bom først). */
  function vanskeligste(uker, antall = 10) {
    const rader = [];
    uker.forEach(uke => uke.verb.forEach(v => {
      const s = forVerb(uke.id, v[0]);
      if (!s.feil) return;
      rader.push({ uke, verb: v, stat: s, vekt: s.feil * 2 - s.riktig - s.rekke });
    }));
    rader.sort((a, b) => b.vekt - a.vekt || b.stat.feil - a.stat.feil);
    return rader.slice(0, antall);
  }

  function totalt(uker) {
    let mestret = 0, sett = 0, verb = 0, riktig = 0, svar = 0;
    uker.forEach(uke => uke.verb.forEach(v => {
      verb++;
      const s = forVerb(uke.id, v[0]);
      if (s.riktig + s.feil > 0) sett++;
      if (s.rekke >= MESTRET_REKKE) mestret++;
      riktig += s.riktig;
      svar += s.riktig + s.feil;
    }));
    return { verb, sett, mestret, riktig, svar, treffprosent: svar ? riktig / svar : 0 };
  }

  const innstilling = (navn, verdi) => {
    if (verdi === undefined) return state.innstillinger[navn];
    state.innstillinger[navn] = verdi;
    skriv();
  };

  function nullstill() {
    state = tomState();
    skriv();
  }

  return {
    MESTRET_REKKE, forVerb, registrer, erMestret, ukeMestring,
    lagreØkt, økter, besteØkt, andel, vanskeligste, totalt, innstilling, nullstill
  };
})();
