/*
 * VerbLab – konfigurasjon
 * ----------------------------------------------------------------------------
 * Legg inn ukens verb her. Én blokk per uke.
 *
 *   id          unik og stabil nøkkel (brukes til å lagre fremgang – ikke endre
 *               den i etterkant, ellers nullstilles statistikken for uka)
 *   navn        vises i appen
 *   verb        [infinitiv, preteritum, perfektum partisipp, norsk]
 *
 * Alternative former skrives med skråstrek: "got/gotten".
 * Da godtas begge deler – og hele strengen – som riktig svar.
 */

const VERB_CONFIG = {
  uker: [
    {
      id: "2026-37",
      navn: "2026 Uke 37",
      verb: [
        ["sell", "sold", "sold", "selge"],
        ["tell", "told", "told", "fortelle"],
      ]
    },
    {
      id: "2026-38",
      navn: "2026 Uke 38",
      verb: [
        ["eat", "ate", "eaten", "spise"],
        ["drink", "drank", "drunk", "drikke"],
        ["sing", "sang", "sung", "synge"]
      ]
    },
    {
      id: "2026-39",
      navn: "2026 Uke 39",
      verb: [
        ["take", "took", "taken", "ta"],
        ["write", "wrote", "written", "skrive"],
        ["wake", "woke", "woken", "våkne"],
      ]
    },
    {
      id: "2026-41",
      navn: "2026 Uke 41",
      verb: [
        ["do", "did", "done", "gjøre"],
        ["go", "went", "gone", "gå / dra"],
        ["say", "said", "said", "si"],
      ]
    },
    {
      id: "ekstra-01",
      navn: "Ekstra 1 – de aller vanligste",
      verb: [
        ["be", "was/were", "been", "være"],
        ["have", "had", "had", "ha"],
        ["get", "got", "got/gotten", "få"],
        ["make", "made", "made", "lage"],
        ["know", "knew", "known", "vite / kjenne"],
        ["see", "saw", "seen", "se"]
      ]
    },
    {
      id: "ekstra-02",
      navn: "Ekstra 2 – hverdagsverb",
      verb: [
        ["come", "came", "come", "komme"],
        ["think", "thought", "thought", "tenke"],
        ["give", "gave", "given", "gi"],
        ["find", "found", "found", "finne"],
        ["become", "became", "become", "bli"],
        ["show", "showed", "shown", "vise"],
        ["leave", "left", "left", "forlate / dra"],
        ["feel", "felt", "felt", "føle"],
        ["put", "put", "put", "sette / legge"]
      ]
    },
    {
      id: "ekstra-03",
      navn: "Ekstra 3 – samme form i preteritum og partisipp",
      verb: [
        ["bring", "brought", "brought", "bringe / ta med"],
        ["begin", "began", "begun", "begynne"],
        ["keep", "kept", "kept", "beholde"],
        ["hold", "held", "held", "holde"],
        ["write", "wrote", "written", "skrive"],
        ["stand", "stood", "stood", "stå"],
        ["hear", "heard", "heard", "høre"],
        ["let", "let", "let", "la"],
        ["mean", "meant", "meant", "bety / mene"],
        ["set", "set", "set", "sette"]
      ]
    },
    {
      id: "ekstra-04",
      navn: "Ekstra 4 – i bevegelse",
      verb: [
        ["meet", "met", "met", "møte"],
        ["run", "ran", "run", "løpe"],
        ["pay", "paid", "paid", "betale"],
        ["sit", "sat", "sat", "sitte"],
        ["speak", "spoke", "spoken", "snakke"],
        ["lie", "lay", "lain", "ligge"],
        ["lead", "led", "led", "lede"],
        ["read", "read", "read", "lese"],
        ["grow", "grew", "grown", "vokse"],
        ["lose", "lost", "lost", "miste / tape"]
      ]
    },
    {
      id: "ekstra-05",
      navn: "Ekstra 5 – litt vanskeligere",
      verb: [
        ["fall", "fell", "fallen", "falle"],
        ["send", "sent", "sent", "sende"],
        ["build", "built", "built", "bygge"],
        ["understand", "understood", "understood", "forstå"],
        ["draw", "drew", "drawn", "tegne"],
        ["break", "broke", "broken", "knuse / brekke"],
        ["spend", "spent", "spent", "bruke (tid / penger)"],
        ["cut", "cut", "cut", "kutte"],
        ["rise", "rose", "risen", "stige"],
        ["drive", "drove", "driven", "kjøre"]
      ]
    },
    {
      id: "ekstra-06",
      navn: "Ekstra 6 – siste pulje",
      verb: [
        ["buy", "bought", "bought", "kjøpe"],
        ["wear", "wore", "worn", "ha på seg"],
        ["choose", "chose", "chosen", "velge"],
        ["sleep", "slept", "slept", "sove"],
        ["win", "won", "won", "vinne"],
        ["catch", "caught", "caught", "fange / rekke"],
        ["teach", "taught", "taught", "undervise"],
        ["fly", "flew", "flown", "fly"],
        ["forget", "forgot", "forgotten", "glemme"]
      ]
    }
  ]
};
