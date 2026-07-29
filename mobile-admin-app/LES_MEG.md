# Bobil Booking — Admin-app (din egen, for mobilen)

Dette er DIN admin-app, ikke kundenes bestillingsapp. Full paritet med
`bobil_booking.html`: biler, kunder, bookinger med betaling/depositum/km/
skadefoto, kostnader (engangs + faste), og godkjenning av forespørsler —
alt synkronisert med samme Supabase-database som nettsiden din, i sanntid.

## Kjøre appen på iPhonen din akkurat nå (uten Mac, uten kostnad)

1. Last ned appen **Expo Go** fra App Store (gratis), hvis du ikke har den fra før.
2. Gå til **snack.expo.dev** i en nettleser.
3. Slett koden som ligger der fra før i `App.js`, og lim inn alt innholdet fra
   filen `App.js` i denne mappen.
4. Snack oppdager automatisk avhengighetene (`@supabase/supabase-js`,
   `@react-native-async-storage/async-storage`, `expo-image-picker`) og
   legger dem til selv — godta eventuell boks som dukker opp.
5. En QR-kode dukker opp til høyre i Snack (eller under "My Device").
   Skann den med **Expo Go**-appen på iPhonen.
6. Logg inn med **samme e-post og passord** som du bruker i nettappen
   (`steffen.skaar@gmail.com`).

Du er da inne i ditt eget dashbord — alt du gjør her (legge til booking,
endre pris, krysse av depositum, laste opp skadefoto osv.) lagres til skyen
og dukker umiddelbart opp i nettappen også, og omvendt.

## Hva appen kan gjøre

- **Oversikt** — nøkkeltall (antall biler, pågår nå, neste 30 dager,
  ubetalt depositum) og liste over kommende bookinger.
- **Kalender** — månedskalender med prikker per bil på opptatte dager,
  trykk på en dag for å se/redigere bookinger den dagen.
- **Bookinger** — full liste, filtrer på status, opprett/rediger/slett.
- **Booking-redigering** — bil, kunde, datoer med automatisk prisforslag
  (samme prislogikk som nettsiden), konflikt-varsel ved overlapp,
  depositum betalt/returnert med dato og beløp, leie betalt, kilometerstand
  ved henting/levering med automatisk kjørelengde, skaderapport-notat og
  skadefoto (velges fra bildebiblioteket på telefonen).
- **Biler** — legg til/rediger/slett, priser (normal/helg/høysesong),
  høysesongperiode, farge til kalenderen, regnr, notater.
- **Kunder** — legg til/rediger/slett, navn/telefon/e-post/notater.
- **Kostnader** — engangskostnader per bil og kategori, samt faste
  månedlige kostnader med av/på-bryter.
- **Forespørsler** — se innkommende bestillingsforespørsler fra
  bestillingssiden/kunde-appen, godkjenn (oppretter booking automatisk,
  sjekker overlapp, oppretter kunde hvis ny) eller avslå.

## Om innlogging

Appen bruker det samme Supabase-brukeren/passordet som admin-nettsiden.
Innloggingen lagres på telefonen (du slipper å logge inn hver gang du
åpner appen), akkurat som i nettleseren.

## Neste steg: ekte App Store-app (valgfritt, senere)

Samme fremgangsmåte som kunde-appen — se `LES_MEG.md` i mobilapp-mappen for
kunder for detaljer om Apple-utviklerkonto og EAS Build. Denne admin-appen
kan bygges til en ekte, nedlastbar app på samme måte når du ønsker det;
siden dette er DIN app trenger den ikke nødvendigvis i App Store i det hele
tatt — Expo Go-varianten fungerer utmerket for eget bruk på ubestemt tid.

## Filer i denne mappen

- `App.js` — hele appen (én fil, lett å lime inn i Snack)
- `package.json` / `app.json` — prosjektoppsett, brukes hvis du senere setter
  opp et ekte lokalt Expo-prosjekt eller kjører EAS Build
