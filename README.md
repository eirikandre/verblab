# VerbLab

Liten nettapp for å øve på uregelrette engelske verb. Ren HTML, CSS og JavaScript –
ingen rammeverk, ingen byggesteg, ingen server nødvendig.

Tjenesten lever på [https://verblab.eidså.no](https://verblab.eidså.no) tilpasset 6 trinn på Flesberg skole

## Kom i gang

Åpne `index.html` rett i en nettleser – appen trenger verken server eller
byggesteg. Vil du kjøre den over http (f.eks. for å teste fra mobilen i samme
nett):

```bash
npm run dev          # http://localhost:8000, PORT=3000 for en annen port
```

## Bygge og pakke

Kildefilene er ferdige til bruk som de er; bygget er bare for å gjøre dem
mindre før de legges ut.

```bash
npm install          # henter esbuild (eneste avhengighet, kun for bygging)
npm run build        # dist/ med minifisert html, css og js
npm run preview      # kjører dist/ på http://localhost:8000
npm run pack         # bygger og lager verblab-<versjon>.zip
npm run clean        # sletter dist/
```

`npm run build` slår sammen `js/config.js`, `js/storage.js` og `js/app.js` til
én `dist/app.min.js`, minifiserer stilarket til `dist/style.min.css` og skriver
en `dist/index.html` som peker på de to. Det blir tre filer på rundt 12 kB
gzippet – legg hele `dist/` på en hvilken som helst webserver.

Skriptene i `tools/` er ren Node uten avhengigheter utenom esbuild, så det er
ingenting å vedlikeholde utover `package.json`.

## Hva appen gjør

To moduser – begge gir fasit underveis, gjentar verbene du ikke får til, og
lagrer resultatet når økta er fullført.

| Modus          | Hva skjer                                                                                                                                                                                                                                                                                                                                                         |
|----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Skriv selv** | Du skriver begge formene. Ett poeng per verb: full pott for riktig uten hjelp, **et halvt poeng hvis du bruker hint**, null for feil. Hint viser de to første bokstavene i begge formene og kan brukes én gang per verb. Verb du bommer på – eller bruker hint på – kommer igjen senere i økta til de sitter.                                                     |
| **Flervalg**   | Ingen skriving: hver form har sin egen rad med fire alternativer – én for preteritum og én for perfektum partisipp – så de vurderes hver for seg. Tastatursnarvei 1–4 for preteritum og 5–8 for partisipp. Distraktorene er verbets *andre* form, den regelrette `-ed`-fella og samme form fra andre verb i uka. Ett poeng per verb der begge formene er riktige. |

**Fremgang** viser mestring per uke, treffprosent, verbene som sitter dårligst
(med snarvei til å øve på nettopp dem) og logg over fullførte økter med poeng,
modus og tidsbruk.

Et verb regnes som **mestret** når du har svart riktig på det tre ganger på rad
i skrivemodus – uten hint. Flervalg teller i treffprosenten og i listen over
vanskelige verb, men bygger ikke mestring: å kjenne igjen riktig form er lettere
enn å produsere den. All fremgang lagres lokalt i nettleseren (`localStorage`) –
ingenting sendes noe sted.

Appen er bygget mobil-først: store trykkflater, bunnmeny på telefon og
to-kolonners layout på desktop. Mørk modus følger systeminnstillingen.

## Legge inn ukens verb

Alt innhold ligger i **`js/config.js`**. Én blokk per uke:

```js
{
  id: "uke-07",                 // unik og stabil – brukes som nøkkel for fremgang
  navn: "Uke 7 – nye ord",      // vises i appen
  verb: [
    // [infinitiv, preteritum, perfektum partisipp, norsk]
    ["swim", "swam", "swum", "svømme"],
    ["ring", "rang", "rung", "ringe"]
  ]
}
```

Noen tips:

* **Alternative former** skrives med skråstrek: `["get", "got", "got/gotten", "få"]`.
  Da godtas både `got`, `gotten` og `got/gotten` som riktig svar.
* Svar sjekkes uten hensyn til store/små bokstaver, ekstra mellomrom og punktum.
* Endrer du `id` på en uke, mister den uka sin lagrede statistikk. Endre gjerne
  `navn` og verblisten, men la `id` stå.
* Antall uker og antall verb per uke er fritt.

## Filer

```
index.html        markup for alle skjermene
css/style.css     stiler, lys/mørk modus, responsiv layout
js/config.js      ← ukens verb legges inn her
js/storage.js     lagring og beregning av fremgang (localStorage)
js/app.js         skjermflyt, skrivemodus, flervalg, resultater
tools/build.js    minifisering til dist/
tools/pack.js     zipper dist/
tools/serve.js    liten statisk server for lokal testing
```
