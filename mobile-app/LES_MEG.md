# Bobil Booking — mobilapp

En ekte app (bygget med React Native / Expo) som viser ledige bobiler og lar
kunder sende en bestillingsforespørsel — samme Supabase-database som
`bestilling.html`, så alt henger sammen og dobbeltbooking unngås.

## Kjøre appen på iPhonen din akkurat nå (uten Mac, uten kostnad)

1. Last ned appen **Expo Go** fra App Store (gratis).
2. Gå til **snack.expo.dev** i en nettleser (på PC, Mac eller mobil — spiller ingen rolle).
3. Slett koden som ligger der fra før i `App.js`, og lim inn alt innholdet fra
   filen `App.js` i denne mappen.
4. Snack oppdager automatisk at koden bruker `@supabase/supabase-js` og
   legger den til som avhengighet av seg selv (godta eventuell boks som dukker opp).
5. En QR-kode dukker opp til høyre i Snack (eller under "My Device").
   Skann den med **Expo Go**-appen på iPhonen (eller rett med kameraet).
6. Appen åpner seg med en gang på telefonen din — henter live bobiler og
   priser fra Supabase, akkurat som bestillingssiden.

Du kan gjøre dette allerede i dag, helt gratis, uten Apple-utviklerkonto.

## Hva appen gjør

- Viser alle bobiler som er lagt inn i admin-appen (samme `public_vehicles`-tabell)
- Kalender per bobil som viser opptatte datoer i rødt
- Kunden velger fra- og til-dato, fyller inn navn/e-post/telefon/melding
- Sender forespørselen til `booking_requests` — dukker opp i "Forespørsler"-fanen
  i admin-appen din, akkurat som fra nettsiden
- Ingen dobbeltbooking: samme datosjekk som på nettsiden

## Neste steg: ekte App Store-app (valgfritt, senere)

Det du har nå kjører perfekt via Expo Go, men er ikke i App Store ennå.
For å publisere den som en ordentlig app kunder laster ned fra App Store trengs:

1. En **Apple-utviklerkonto** (ca. 1000 kr/år) — opprettes på developer.apple.com
2. Bygging av appen i skyen med **EAS Build** (Expo sin tjeneste — krever
   fortsatt ikke en Mac, kan gjøres fra hvilken som helst PC med Node.js installert):
   ```
   npx eas-cli build --platform ios
   ```
3. Innsending til App Store via `eas submit`, og 1–2 ukers godkjenning fra Apple

Dette er et eget, større steg — si ifra når du vil ta det, så hjelper jeg deg
gjennom det (jeg kan skrive alt av oppsett-kommandoer, men selve
byggingen/innsendingen må skje fra en maskin med internettilgang til Apple/Expo
sine tjenester, siden jeg ikke har det i dette miljøet).

## Filer i denne mappen

- `App.js` — hele appen (én fil, lett å lime inn i Snack)
- `package.json` / `app.json` — prosjektoppsett, brukes hvis du senere setter
  opp et ekte lokalt Expo-prosjekt eller kjører EAS Build
