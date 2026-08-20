# Bobil Booking — arbeidsnotat for Claude

Denne filen leses automatisk ved starten av hver økt. Den finnes for at en ny
samtale skal kunne fortsette der forrige slapp, uten at Steffen må forklare
alt på nytt.

## Hvem dette er for

Steffen Skaar driver bobilutleie. Han er **ikke utvikler**. Svar alltid på
**norsk**, i klarspråk, uten sjargong. Forklar konsekvenser framfor
implementasjon. Han skal aldri måtte kjøre kommandoer eller redigere kode for
å få noe til å virke.

## Hva systemet er

Et bookingsystem for bobilutleie. Alt er rene enkeltfiler uten byggesteg —
ingen npm, ingen kompilering. En fil er hele appen.

| Fil | Hva det er |
| --- | --- |
| `index.html` | Admin-nettsiden for PC. Mørkt tema. Publiseres som forsiden på GitHub Pages. |
| `mobil.html` | Admin-appen for mobil, en installerbar PWA. Lyst tema, bunnmeny. Det Steffen bruker daglig. |
| `bestilling.html` | Den offentlige bestillingssiden kundene ser. |
| `manifest.json`, `sw.js`, `icon-*.png` | Gjør `mobil.html` installerbar på hjem-skjermen. |
| `mobile-app/` | Kunde-app i Expo/React Native. Bygget tidlig, brukes ikke aktivt. |
| `mobile-admin-app/` | Admin-app i Expo/React Native. Erstattet av `mobil.html`, men holdes i synk. |

Publisert på GitHub Pages: `https://mircahode.github.io/BobilBooking/`
Mobilappen: `.../mobil.html`

## Hvordan endringer kommer ut

Steffen laster som regel opp filene selv via **Add file → Upload files** på
github.com. Denne økten har ofte ikke skrivetilgang til repoet — se
«GitHub-tilgang» nederst. **Lever alltid ferdige filer med `SendUserFile`**,
og si tydelig hvilken mappe hver fil skal i.

## Backend

Supabase (Postgres + Auth + RLS). Den offentlige anon-nøkkelen ligger åpent i
filene, som den skal.

| Tabell | Rolle |
| --- | --- |
| `app_state` | Hele databasen som ett JSON-objekt i kolonnen `data`, én rad per bruker, RLS på `auth.uid()`. |
| `public_vehicles`, `public_bookings` | Offentlig lesbare speil, skrives av `syncPublicData()`. Bestillingssiden leser herfra. |
| `booking_requests` | Kunder kan sette inn, bare eier kan lese og oppdatere. |

Innlogging er passord mot en fast e-post (`AUTH_EMAIL`), ikke fritt
brukervalg. Økten huskes på enheten.

**Viktig om RLS:** slår man på RLS med bare en `select`-policy, blokkeres
insert/update/delete i stillhet. Riktig form er
`for all using (auth.uid() is not null) with check (auth.uid() is not null)`.

## Datamodell

Alt ligger i ett JSON-objekt, lokalt under nøkkelen `bobilBookingData_v1`.

- **Vehicle**: `id, name, regnr, dailyRate, weekendRate, highSeasonRate, color, hsStart, hsEnd, notes, inServiceFrom, includedKmPerDay, extraKmPrice`
  `hsStart`/`hsEnd` er `"DD.MM"`. `inServiceFrom` er `"ÅÅÅÅ-MM"`.
- **Customer**: `id, name, phone, email, notes`
- **Booking**: `id, vehicleId, customerId, startDate, endDate, totalPrice, deposit, status, notes, depositPaid, depositPaidDate, depositReturned, depositReturnedDate, depositReturnedAmount, depositNotes, rentPaid, kmStart, kmEnd, tripCosts, tripCostsNotes, damageNotes, damageImages, createdAt`
  `status` er `"bekreftet" | "forespørsel" | "avlyst"`.
- **Cost**: `id, vehicleId, date, category, amount, notes`
- **FixedCost**: `id, vehicleId, category, amountPerMonth, active`

Feltnavnene er `kmStart`/`kmEnd`. Det finnes et ubrukt `kmIn`/`kmOut` ett
sted i `index.html` — ikke bygg videre på det.

## Forretningsregler

- Pris regnes per natt, med egne satser for helg og høysesong (`calcPrice`).
- **200 km inkludert per døgn, 3,50 kr per km utover.** Ligger på bilen, så
  hver bobil kan ha egne satser.
- Depositum gjøres opp slik: overkjørte km × sats, pluss reisekostnader
  (AutoPASS, ferje, drivstoff — ett samlet beløp), trekkes fra depositumet.
  Resten er til utbetaling. Blir trekket større enn depositumet, vises hva
  kunden skylder i tillegg framfor et negativt tall.
- Kostnad per bil løper fra `inServiceFrom`: faste kostnader × antall måneder
  pluss engangskostnader. Inneværende måned regnes som hel. Er feltet tomt,
  utledes måneden fra eldste kostnad eller booking.
- **Kjent begrensning:** en fast kostnad har ingen egen startdato, den regnes
  fra bilens driftsmåned. Er en forsikring tegnet senere, blir «faste hittil»
  for høy. Steffen er informert. Løsningen er en startmåned per fast kostnad.

## Fallgruver som har kostet dyrt

Disse er alle funnet den harde veien. Ikke gjeninnfør dem.

**Datoer må bygges fra lokale komponenter.** `toISO()` skal bruke
`getFullYear()`, `getMonth()+1`, `getDate()` — aldri
`toISOString().slice(0,10)`. UTC-varianten gjorde at `addDays()` returnerte
samme dato i norsk sommertid, og `bestilling.html` låste seg i en evig løkke.
Sammenlign datoer som ISO-strenger (`a < b`) framfor `new Date()`-regning.

**Skadebilder lagres som `{name, dataUrl}`.** En periode lagret `mobil.html`
dem som ren tekststreng, og da var bilder lagt inn ett sted usynlige de andre
stedene. Alle tre appene leser nå begge formater og konverterer til objekt.

**Aldri fall tilbake på originalbildet i full størrelse.** `shrinkImage`
gjorde det når telefonen ikke klarte å dekode et HEIC-bilde. Ett slikt bilde
la flere MB i databasen, lagringen sprakk, og bildene forsvant. Avvis heller
bildet med en forklaring. Bilder komprimeres til 1000 px / kvalitet 0,55,
rundt 130 KB.

**Lagring må aldri feile i stillhet.** Både full localStorage-kvote og
mislykket sky-lagring ble tidligere svelget. Vis det, og prøv igjen.

**`pullFromCloud` må ikke overskrive ulagrede endringer.** Flagget
`unsavedChanges` står sant til skyen har bekreftet mottak. Var det denne
feilen som faktisk slettet Steffens skadebilder.

**Horisontal `ScrollView` i React Native strekker seg vertikalt** når den er
direkte flex-barn av en kolonne. Må ha fast høyde og `flexGrow: 0`.

**`closeModal(force)` koblet til `onclick`** får klikk-eventet inn som
`force`. Bruk `onclick = () => closeModal()`.

## Sikkerhetsnett

`mobil.html` tar vare på forrige versjon under nøkkelen
`bobilBookingData_v1_forrige` før skyen får overskrive noe, og har
sikkerhetskopi, gjenoppretting fra fil og «hent tilbake forrige versjon»
under **Mer**. Er det ikke plass, lagres kopien uten bilder framfor ikke i
det hele tatt. `index.html` har «Eksporter data» / «Importer data» i toppen.

Det finnes **ingen** sikkerhetskopi i Supabase — gratisplanen har ingen
gjenopprettbare backups. Filkopien er alt som finnes.

## Slik testes endringer

Sandkassen når ikke `registry.npmjs.org`, så det finnes ikke noe
byggeoppsett. Test slik i stedet:

1. Syntaks: hent ut `<script>`-blokkene og kjør `node --check`.
2. Oppførsel: server mappa med `python3 -m http.server`, kjør Playwright fra
   `/home/claude/.npm-global/lib/node_modules/playwright`, og avskjær
   `**/supabase-js**` med en enkel mock som simulerer `app_state`-raden.
3. **Regn alltid ut fasitverdiene for hånd** og sammenlign, framfor å se på
   at det «ser riktig ut». Sjekk at `mobil.html` og `index.html` gir
   identiske tall.
4. Kjør et datasett med eksisterende data gjennom begge filene og diff felt
   for felt, så en endring aldri rører data den ikke skal.

Et ensfarget testbilde komprimeres til nesten ingenting og gir falsk trygghet
— bruk et støyete bilde i realistisk størrelse.

## GitHub-tilgang

Repoet velges når en økt startes, ikke underveis. Har denne økten ikke
tilgang, hjelper det ikke å endre innstillinger midt i — lever filene med
`SendUserFile` i stedet. For å slippe det i framtiden: koble GitHub på
claude.ai/code og start økten med repoet valgt, eventuelt via
`https://claude.ai/code?repositories=Mircahode/BobilBooking`.

## Ting som er vurdert, men ikke gjort

- Stripe-betaling på bestillingssiden.
- EmailJS-varsling ved nye forespørsler.
- Ekte App Store-app via EAS Build (krever Apple-utviklerkonto, rundt 1 000
  kr i året). PWA-en dekker behovet.
- Skadebilder i Supabase Storage framfor base64 i JSON-blobben. Riktig på
  sikt hvis bildemengden vokser; krever at Steffen setter opp en bucket.
