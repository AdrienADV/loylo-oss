# Loylo OSS

Open-source digital loyalty cards for Apple Wallet and Google Wallet. Merchants design a card,
customers add it to their phone's wallet, and the card shows their points.

Built with [TanStack Start](https://tanstack.com/start) on Cloudflare Workers and
[Supabase](https://supabase.com) (Postgres, Auth, Storage), with the shadcn design system.

> **Status: MVP complete.** It was built in 11 pull requests; [`docs/PLAN.md`](docs/PLAN.md)
> has the plan, the decisions taken along the way and the known issues.

## Features

- **Merchant accounts**: sign up with email confirmation, sign in, password reset, and an account
  page to change the email or the password and to delete the account with all its data.
- **Loyalty programs**: create, edit and delete a program (name, card color, welcome points,
  logo) with a live preview of the card. Logo images are resized in the browser.
- **Enrollment**: a public page per program (`/join/{programId}`) and its QR code, where customers
  enter their name and email and add the card to Apple Wallet or Google Wallet. Merchants can also
  issue a card at the counter: the customer scans a QR code to add it.
- **Members and points**: each program lists its members with search, pagination and whether
  their card is in their wallet. Merchants scan a card with the phone's camera (or a barcode
  scanner) to open the member, add or redeem points, and see the history of every change.
- **Wallet integration**:
  - Apple passes are signed on the fly from the database.
  - Google passes are created through the Google Wallet API.
  - Apple's PassKit Web Service and Google's callbacks track whether each pass is installed.
  - After a points change, Apple devices get a push and download the updated pass, and Google
    passes get their new balance. Program changes reach every pass the same way.
- **Messages**: merchants send a short message to every card of a program, with a preview. It
  shows on the card and notifies customers; the database allows one message per 24 hours and a
  monthly cap set by the deployment.

Each wallet is optional: without its configuration, its button does not show.

## Self-hosting

Loylo runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/) and a
[Supabase](https://supabase.com) project. You need:

- a Supabase project, and an SMTP provider for its emails;
- a Cloudflare account and a domain (Wallet apps only talk to HTTPS);
- for Apple Wallet, an Apple Developer account; for Google Wallet, a Google Pay & Wallet Console
  issuer account and a Google Cloud project. Each wallet is optional.

### 1. Supabase

1. Create a project. In Project Settings > API Keys, note the project URL, the publishable key
   and the secret key.
2. Apply the schema (tables, Row Level Security, functions and the `program-assets` bucket):

   ```bash
   bunx supabase login
   bunx supabase link --project-ref <project ref>
   bunx supabase db push
   ```

3. In Authentication:
   - URL Configuration: set the Site URL to your app's URL (`APP_URL`): email links use it.
   - Email Templates: paste `supabase/templates/confirmation.html` into "Confirm signup",
     `recovery.html` into "Reset password" and `email_change.html` into "Change email address"
     (subjects in `supabase/config.toml`). Their links go to `/auth/confirm`.
   - Sign In / Providers: keep "Confirm email" and "Secure email change" on, with a minimum
     password length of 8.
   - Rate Limits: enable IP address forwarding, so Supabase limits each visitor rather than your
     Worker.
   - Emails > SMTP Settings: set up your SMTP provider. The built-in sender only delivers a few
     emails per hour, to your team's addresses.

### 2. Apple Wallet (optional)

In your Apple Developer account (Certificates, Identifiers & Profiles):

1. Register a Pass Type ID (`pass.com.example.loyalty`): `APPLE_PASS_TYPE_ID`. Your Team ID
   (Membership details) is `APPLE_TEAM_ID`.
2. Create its certificate from a signing request, then convert it to PEM:

   ```bash
   openssl req -new -newkey rsa:2048 -nodes -keyout signer.key -out signer.csr -subj "/CN=Loylo"
   # Upload signer.csr in the Pass Type ID's "Create Certificate", download pass.cer, then:
   openssl x509 -inform DER -in pass.cer -out signer.pem
   ```

   `signer.pem` is `APPLE_SIGNER_CERT` and `signer.key` is `APPLE_SIGNER_KEY`
   (`APPLE_SIGNER_KEY_PASSPHRASE` only for an encrypted key).
3. Download the "Worldwide Developer Relations - G4" certificate from
   [Apple PKI](https://www.apple.com/certificateauthority/) and convert it the same way:
   `APPLE_WWDR_CERT`.
4. Under Keys, create a key with Apple Push Notifications service (APNs): the `.p8` file is
   `APNS_KEY` and its Key ID `APNS_KEY_ID`. Without it, passes only update when their holder
   refreshes them.

PEM values can sit on one line with `\n` for line breaks:
`awk 'NF {printf "%s\\n", $0}' signer.pem`.

### 3. Google Wallet (optional)

1. In the [Google Pay & Wallet Console](https://pay.google.com/business/console), open Google
   Wallet API: the issuer ID is `GOOGLE_ISSUER_ID`.
2. In Google Cloud, enable the Google Wallet API, create a service account and a JSON key for it.
   The key, on one line (`jq -c . key.json`), is `GOOGLE_SERVICE_ACCOUNT_JSON`.
3. Back in the Wallet console, add the service account's email under Users.
4. A new issuer is in demo mode: only the test accounts listed in the console can save passes
   until Google grants publishing access.

Google downloads program logos from Supabase Storage and calls `{APP_URL}/api/google/callback`
when a pass is saved or deleted.

### 4. Cloudflare Workers

1. In `wrangler.jsonc`, give the two rate limiters `namespace_id` values that are unique in your
   Cloudflare account (and rename the Worker if you like).
2. Set the variables below, as secrets for the sensitive ones:
   `bunx wrangler secret put SUPABASE_SECRET_KEY`, or in the dashboard (Worker > Settings >
   Variables and Secrets).
3. Deploy with `bunx wrangler login` then `bun run deploy`, and add your domain to the Worker
   (Settings > Domains & Routes).

| Variable | Needed for | Value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | always | Supabase project URL (read by the server at runtime) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | always | Supabase publishable key |
| `SUPABASE_SECRET_KEY` | always | Supabase secret key: keep it secret |
| `APP_URL` | wallets | Public HTTPS URL of the app, without trailing slash |
| `APPLE_TEAM_ID`, `APPLE_PASS_TYPE_ID` | Apple Wallet | See step 2 |
| `APPLE_WWDR_CERT`, `APPLE_SIGNER_CERT`, `APPLE_SIGNER_KEY`, `APPLE_SIGNER_KEY_PASSPHRASE` | Apple Wallet | PEM contents, see step 2 |
| `APNS_KEY_ID`, `APNS_KEY` | Apple pass updates | See step 2 |
| `GOOGLE_ISSUER_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Wallet | See step 3 |
| `NOTIFICATIONS_MONTHLY_CAP` | messages | Messages per program and month: 4 by default, 0 turns them off |

To check the deployment: sign up (the confirmation email arrives through your SMTP provider),
create a program, open its enrollment link on a phone and add the card to a wallet, then scan it
and add points: the card updates on the phone.

Large programs: messages and program edits push every Apple device from one request, and each
push counts against the Worker's subrequest limit (see the known issues in the plan).

## Local development

Requirements: [Bun](https://bun.sh), Docker, and the Supabase CLI (installed as a dev dependency).

```bash
bun install
bunx supabase start      # local Postgres, Auth, Storage, Mailpit
bunx supabase db reset   # applies supabase/migrations
```

Copy `.env.example` to `.env.local` and fill in the Supabase values printed by
`bunx supabase status` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`). Apple and Google Wallet variables are only needed to issue passes for that
wallet; the comments in `.env.example` explain each one.

```bash
bun run dev              # http://localhost:3000
```

Auth emails (confirmation, password reset, email change) land in Mailpit: http://127.0.0.1:54324.

Wallet limitations in development:
- Wallet apps require HTTPS to reach the app. For Apple, a tunnel works, or "Allow HTTP Services"
  in the iPhone's developer settings.
- Google needs an HTTPS logo URL, so Google passes fail with the local Supabase URL.
- Apple push notifications only work from a deployed Worker.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Development server (Vite + the Workers runtime) |
| `bun run build` | Production build |
| `bun run test` | The `.pkpass` validation test, run in the Workers runtime |
| `bun run check` | Biome lint and format check |
| `bun run gen:types` | Regenerates `src/lib/supabase/database.types.ts` from the local database |
| `bun run deploy` | Builds and deploys with Wrangler |

## Project layout

- `src/features/` — one folder per feature (`auth`, `account`, `programs`, `members`,
  `enrollment`, `wallet-services`, `wallet-sync`, `notifications`): Zod schemas, server
  functions, server-only use cases, components.
- `src/lib/wallet/` — Apple (pass builder, signing, APNs) and Google (API client, objects,
  callback verification) adapters.
- `src/routes/` — pages and server routes (file-based routing).
- `supabase/migrations/` — the database schema, with Row Level Security on every table.

The [code map in the plan](docs/PLAN.md#code-map) has more detail.

## Contributing

Code, comments, commits and pull requests are in English; commits follow
[Conventional Commits](https://www.conventionalcommits.org). See [`AGENTS.md`](AGENTS.md) for the
conventions and [`docs/PLAN.md`](docs/PLAN.md) for how each change is verified.
