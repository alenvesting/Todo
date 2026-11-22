# Bocka ✅

En enkel ersättare för Microsoft To Do: inköpslistor, att göra-listor och uppgifter som du kan bocka av,
organisera och **dela med de du bjuder in**. Fungerar i webbläsaren och kan installeras som app på mobilen.

## Funktioner

| | |
|---|---|
| **Listor** | Egna listor med namn, ikon (emoji) och färg. Byt namn, ta bort, lämna delade listor. |
| **Uppgifter** | Bocka av med ett tryck, stjärnmärk som viktig, förfallodatum, upprepning (dag/vardagar/vecka/månad/år), anteckning, delsteg, flytta mellan listor. Slutförda hamnar i en hopfällbar sektion. Ångra vid borttagning. |
| **Smarta listor** | *Min dag* (personlig, nollställs varje dag), *Viktigt*, *Planerat* (grupperat: försenat/idag/imorgon/veckan/senare), *Tilldelat mig*. |
| **Delning** | Bjud in via e-post eller med en länk (SMS/WhatsApp/Messenger). Se medlemmar, tilldela uppgifter, ta bort medlemmar, sluta dela. |
| **Inloggning** | E-post (länk eller engångskod – inget lösenord), Microsoft, Google och Facebook/Meta. |
| **Realtid** | Bockar din partner av mjölken syns det direkt hos dig. |
| **Offline** | Ändringar sparas i telefonen och skickas när nätet är tillbaka – praktiskt i butiker med dålig täckning. |
| **App** | Installeras på hemskärmen (PWA) på iPhone och Android. Ljust och mörkt läge. Helt på svenska. |
| **Säkerhet** | Row Level Security i databasen: man kan bara se och ändra listor man är medlem i (49 automatiska tester). |

## Testa direkt (demoläge, utan konto)

```bash
cd web
npm install
npm run dev
```

Öppna http://localhost:5173. Utan Supabase-nycklar körs appen i **demoläge**: allt sparas bara i webbläsaren
och delning/inloggning är avstängt. Perfekt för att känna på gränssnittet.

## Sätt upp på riktigt (ca 30–60 min första gången)

Appen består av två delar:

- **`supabase/`** – databas, inloggning och realtid hos [Supabase](https://supabase.com) (gratisnivån räcker gott för familj och vänner).
- **`web/`** – webbappen (React + Vite), som du lägger ut gratis på t.ex. Vercel, Netlify eller Cloudflare Pages.

### 1. Skapa databasen

1. Skapa ett konto och ett projekt på [supabase.com](https://supabase.com). Välj regionen **Stockholm (eu-north-1)**.
2. Gå till **SQL Editor**, klistra in hela innehållet i
   [`supabase/migrations/20261122000000_init.sql`](supabase/migrations/20261122000000_init.sql) och kör.
3. Hämta nycklarna under **Project Settings → API**: *Project URL* och *anon public key*.

### 2. Lägg ut webbappen

Exempel med **Vercel** (Netlify fungerar likadant – `_redirects` finns redan):

1. Importera GitHub-repot på [vercel.com](https://vercel.com).
2. **Root Directory:** `web` · **Build command:** `npm run build` · **Output:** `dist`
3. Lägg till miljövariablerna (se [`web/.env.example`](web/.env.example)):
   - `VITE_SUPABASE_URL` = din Project URL
   - `VITE_SUPABASE_ANON_KEY` = din anon key
   - `VITE_AUTH_PROVIDERS` = `azure,google,facebook` (ta bort de du inte satt upp ännu)
4. Deploya och notera adressen, t.ex. `https://bocka.vercel.app` (eller koppla en egen domän).

### 3. Inloggning

Gå till **Authentication → URL Configuration** i Supabase:

- **Site URL:** `https://din-adress`
- **Redirect URLs:** `https://din-adress/**` och `http://localhost:5173/**`

Callback-adressen som Microsoft/Google/Meta ska ha är alltid
`https://<ditt-projekt>.supabase.co/auth/v1/callback` (visas även i Supabase under respektive provider).

**E-post (länk + kod)**
- Aktiverat som standard. Klistra in [`supabase/email-templates/magic-link.html`](supabase/email-templates/magic-link.html)
  under **Authentication → Email Templates → Magic Link** så att mejlet även innehåller en **sexsiffrig kod**
  (behövs på iPhone, där länken annars öppnas i Safari i stället för i den installerade appen).
- Supabases inbyggda e-post klarar bara några få mejl i timmen. Koppla en egen SMTP (t.ex. Resend eller Brevo, båda
  har gratisnivå) under **Project Settings → Authentication → SMTP** innan ni blir fler.

**Microsoft** ([Supabase-guide](https://supabase.com/docs/guides/auth/social-login/auth-azure))
1. [Azure Portal](https://portal.azure.com) → *Microsoft Entra ID* → *App registrations* → *New registration*.
2. Kontotyper: **"Accounts in any organizational directory and personal Microsoft accounts"** (så att både
   jobb- och privatkonton som Hotmail/Outlook.com fungerar).
3. Redirect URI (Web): callback-adressen ovan. Skapa en *client secret*.
4. I Supabase: **Authentication → Providers → Azure** – fyll i Application (client) ID och secret. Lämna Tenant URL tom.

**Google** ([Supabase-guide](https://supabase.com/docs/guides/auth/social-login/auth-google))
1. [Google Cloud Console](https://console.cloud.google.com) → *APIs & Services* → *OAuth consent screen* (External).
2. *Credentials* → *Create OAuth client ID* → *Web application*, lägg till callback-adressen under *Authorized redirect URIs*.
3. In i Supabase under **Providers → Google**.

**Facebook / Meta** ([Supabase-guide](https://supabase.com/docs/guides/auth/social-login/auth-facebook))
1. [Meta for Developers](https://developers.facebook.com) → *Create app* → användningsfall *Autentisera med Facebook Login*.
2. Lägg till callback-adressen under *Valid OAuth Redirect URIs*, och se till att behörigheten `email` är med.
3. Appen måste sättas i läget **Live** för att andra än du ska kunna logga in – det kräver en länk till en integritetspolicy.
4. In i Supabase under **Providers → Facebook**.

> Loggar samma person in med olika metoder som har **samma e-postadress** kopplar Supabase ihop dem till ett konto.

### 4. Installera på telefonen

- **iPhone:** öppna adressen i Safari → Dela-knappen → **Lägg till på hemskärmen**.
- **Android:** öppna i Chrome → menyn → **Installera app**.

## Så fungerar delning

1. Öppna en lista → **Dela**.
2. **Bjud in med e-post:** skapar en personlig engångsinbjudan och öppnar ditt mejlprogram med en färdig text.
   Loggar mottagaren in med samma adress dyker inbjudan dessutom upp direkt i appens sidomeny.
3. **Inbjudningslänk:** skicka via SMS/WhatsApp/Messenger. Alla med länken kan gå med tills du återkallar den
   (gäller i 30 dagar).
4. Den inbjudna loggar in med valfri metod (e-post, Microsoft, Google, Facebook) och trycker **Gå med**.

Alla medlemmar kan lägga till, bocka av och ändra uppgifter och bjuda in fler. Bara ägaren kan ta bort listan,
ta bort medlemmar och sluta dela. *Min dag* är alltid personlig.

## Projektstruktur

```
supabase/
  migrations/…_init.sql      Tabeller, säkerhetsregler (RLS), triggers, inbjudnings-funktioner
  tests/run.sh               Kör migrationen + 49 säkerhetstester mot en lokal Postgres
  email-templates/           E-postmall med inloggningskod
web/
  src/store.tsx              Datalager: offline-kö, realtid, cache
  src/lib/apply.ts           Optimistiska uppdateringar (testade)
  src/lib/supabase.ts        Allt som pratar med Supabase
  src/components/            Gränssnittet
```

## Tester

```bash
./supabase/tests/run.sh        # databas + säkerhet (kräver PostgreSQL installerat lokalt)
cd web && npm test             # logik för synk, smarta listor, datum
cd web && npm run build        # typkontroll + produktionsbygge
```

GitHub Actions kör allt automatiskt vid varje push (`.github/workflows/ci.yml`).

## Idéer för nästa steg

- Påminnelser med push-notiser (Web Push stöds nu även på iPhone för installerade appar).
- Dra-och-släpp för att sortera uppgifter och listor.
- Import från Microsoft To Do innan den stängs.
- Listgrupper (mappar) som i Microsoft To Do.
- App i App Store / Google Play via Capacitor, om ni vill ha "riktiga" appar.
