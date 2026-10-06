# Loylo OSS — MVP plan

Status: **draft, to be validated** before any implementation.

Loylo OSS is a web-only, open-source rewrite of Loylo (`loylo-api` AdonisJS backend +
`loylo-app` Ionic/Capacitor app), built on **TanStack Start** and **Supabase**.
It is a clean rewrite: the old repos are used as a functional reference, not as code to copy.

## MVP scope

1. Merchant sign up / sign in with email + password (plus password reset).
2. Loyalty program ("card") creation: name, color, logo, initial points.
3. Pass issuance for customers, both self-service (public enrollment link / QR code) and
   manual (merchant issues a pass for a given customer).
4. Points system: scan a customer pass, add / remove points, history.
5. Marketing notifications: push a message to every wallet holding the program's pass.

Out of scope (dropped from the original): RevenueCat paywall, "event" card type,
FCM push to the merchant's phone, Capgo updates, server-side background removal, articles/blog.

## What the original does (reference)

| Flow | Original implementation |
| --- | --- |
| Create card | `POST /cards/create`: uploads logo, `sharp` resizes icons, `@imgly` removes background, writes an Apple `pass.json` template into the `apple-passes` bucket, creates a Google Wallet `loyaltyClass`, inserts a `card` row. |
| Enrollment | Public page `/form/:id` (Inertia). Customer submits name, email, wallet → upsert `client`, create `client_card` (serial number) → returns a signed `.pkpass` or a Google "save" URL. |
| Manual issue | `POST /cards/generate`: generates a `.pkpass`, uploads it to `tmp-passes`, returns a signed URL. |
| Apple Wallet updates | PassKit Web Service (`/v1/devices/...`, `/v1/passes/...`) + `device` / `registration` tables + APNs push via `hapns` (token auth, `.p8` key). |
| Google Wallet updates | REST `PATCH loyaltyObject`, save/delete callback verified with ECv2 signatures. |
| Points | App scans the QR code (= serial number), then `+50`, `+100` or reset, via `cards/apple/update` or `cards/google/update`. |
| Marketing | Rewrites `backFields[0]` (with `changeMessage`) of the Apple template + silent push to all devices; Google `loyaltyClass/addMessage` with `TEXT_AND_NOTIFY`. 1 message / 24 h, counter `available_notifications`. |

### Problems not to reproduce

- **Secrets committed in `loylo-api`**: Apple signer key/cert, APNs `.p8` key, RevenueCat
  webhook bearer token hardcoded in `webhooks_controller.ts`. They should be rotated; in OSS
  every secret comes from env vars.
- **Missing ownership checks**: `cards/apple/update`, `cards/google/update` and
  `cards/generate` never check that the card belongs to the caller → any signed-in user can
  change anyone's points. Authorization will live in RLS + server functions.
- **Read-modify-write on points** (race conditions, no history) → atomic SQL function + ledger.
- **Global `client` table keyed by email** shared across merchants → customers scoped per program.
- **Apple `GET registrations`** ignores `passesUpdatedSince` and always returns `lastUpdated = now`
  → implement the spec with an `updated_at` column.
- **Notification quota** stored as a decrementing counter with no reset → derive it from the
  `notifications` history.
- Null check on `card` performed after dereferencing it; auth token uniqueness check queries a
  non-existent column.

## Platform constraints (Cloudflare Workers)

The starter deploys to Cloudflare Workers (`wrangler.jsonc`, `nodejs_compat`). Consequences:

| Need | Original | Plan |
| --- | --- | --- |
| Image resize / icons | `sharp` (native) | Resize in the browser (canvas) before upload; store `icon.png`, `icon@2x.png`, `logo.png`. |
| Background removal | `@imgly/background-removal-node` | Dropped for the MVP. |
| Pass signing (PKCS#7) | `passkit-generator` + certs on disk | `passkit-generator` (pure JS, `node-forge`) with certs from env vars. **Spike needed** to confirm it runs on Workers. |
| Google Wallet auth | `google-auth-library`, `jsonwebtoken` | `jose` (WebCrypto) to sign the service-account JWT and the "save" JWT. |
| Google callback verification | Node `crypto.verify` | WebCrypto ECDSA P-256. |
| APNs push | `hapns` (HTTP/2) | **Risk**: APNs requires HTTP/2, which Workers outbound `fetch` likely does not provide. Proposal: send APNs pushes from a Supabase Edge Function (Deno), triggered by the app. **Spike needed.** |
| Env vars | `process.env` at module scope | Read per request (or via `cloudflare:workers` `env`). |

Alternative if the spikes fail: deploy the Start app on Node (Docker), where all of the above works as-is.

## Database (Supabase, `public` schema, RLS on every table)

```
auth.users
   │ 1..n
programs ──────────── 1..n ── passes ── n..1 ── customers
   │                           │  │
   │ 1..n                      │  └─ 1..n ── point_transactions
notifications                  └─ n..n (apple_registrations) ── apple_devices
```

- **`programs`** (was `card`): `id uuid pk`, `owner_id uuid → auth.users`, `name text`,
  `background_color text`, `logo_path text`, `initial_points int`, `google_class_id text`,
  `wallet_message text` (current marketing message shown on the pass back),
  `created_at`, `updated_at`.
- **`customers`** (was `client`): `id`, `program_id → programs`, `email citext`,
  `first_name`, `last_name`, `created_at`; `unique (program_id, email)`.
- **`passes`** (was `client_card` + `apple_passes` + `google_passes`): `id`, `program_id`,
  `customer_id`, `serial_number text unique` (random, encoded in the QR code),
  `authentication_token text` (Apple web service secret), `wallet wallet_type ('apple' | 'google')`,
  `google_object_id text`, `points int check (points >= 0)`, `installed_at timestamptz null`
  (null = not added to a wallet yet), `created_at`, `updated_at`;
  `unique (program_id, customer_id)`.
- **`point_transactions`**: `id bigint identity`, `pass_id`, `delta int`, `balance_after int`,
  `created_by uuid`, `created_at`. Written only by `adjust_points(pass_id, delta)`
  (single `update ... returning` + insert, so no lost updates).
- **`apple_devices`**: `id`, `device_library_identifier text unique`, `push_token text`.
- **`apple_registrations`**: `device_id`, `pass_id`, `pk (device_id, pass_id)`.
- **`notifications`**: `id`, `program_id`, `message text check (length <= 100)`,
  `sent_by`, `created_at`. Quota (e.g. 1 / 24 h, N / 30 days, configurable) computed from it.

Indexes on every FK, on `passes (program_id, created_at)` and a trigram or prefix index for
customer search if needed.

**RLS**: merchants (`to authenticated`) can read/write only rows whose program has
`owner_id = (select auth.uid())`. `apple_devices` / `apple_registrations` have RLS on and
no policies (server-only). Public flows (enrollment, Apple/Google web services) are not
authenticated users: they go through server code using the secret key, with strict input
validation. Types generated with `supabase gen types`.

**Storage**: one public bucket `program-assets`, path `{owner_id}/{program_id}/{icon.png|icon@2x.png|logo.png}`
(must be public: Google Wallet fetches the logo by URL). Insert/update/delete policies restricted to
the owner's folder. No `pass.json` templates and no temporary pass bucket: passes are built from DB
data and streamed directly.

Migrations live in `supabase/migrations`, plus `supabase/seed.sql` for local dev.

## Pages (file routes)

Public:

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/login`, `/signup` | Email + password |
| `/forgot-password`, `/reset-password` | Password reset |
| `/auth/confirm` (server route) | Email confirmation / recovery token exchange |
| `/join/$programId` | Customer enrollment form (name, email, wallet) → "Add to Apple Wallet" / "Save to Google Wallet" |

Merchant (`_authed` layout, guard in `beforeLoad`):

| Route | Purpose |
| --- | --- |
| `/dashboard` | List of programs, "create" CTA |
| `/programs/new` | Create a program with live pass preview |
| `/programs/$programId` | Layout with tabs; index = customers list (search, status, pagination) |
| `/programs/$programId/customers/new` | Issue a pass manually for a customer |
| `/programs/$programId/customers/$passId` | Customer detail: balance, add / remove points, history |
| `/programs/$programId/scan` | Camera QR scan (browser `BarcodeDetector` with a JS fallback) → customer detail |
| `/programs/$programId/share` | Enrollment link + QR code (copy / download) |
| `/programs/$programId/notifications` | Compose message, preview, quota, history |
| `/programs/$programId/settings` | Edit / delete the program |
| `/account` | Email, password, delete account |

## Server functions and routes

Organization per the TanStack Start skills: `*.functions.ts` (`createServerFn`, safe to import
anywhere) and `*.server.ts` (server-only helpers). Inputs validated with Zod via `.inputValidator()`.
Auth enforced in a function middleware (`authMiddleware`) that builds the cookie-based Supabase
server client and verifies the user (`getClaims()`/`getUser()`, to be confirmed against current
Supabase docs), never only in `beforeLoad`.

Auth — `auth.functions.ts`: `signUp`, `signIn`, `signOut`, `requestPasswordReset`,
`updatePassword`, `getCurrentUser`.

Programs — `programs.functions.ts`: `listPrograms`, `getProgram`, `createProgram`
(FormData with the browser-resized images; creates the Google class), `updateProgram`,
`deleteProgram`.

Passes / customers — `passes.functions.ts`: `listPasses` (search + cursor pagination),
`getPass`, `findPassBySerial` (scan), `issuePass` (manual), `adjustPoints`
(calls the `adjust_points` RPC then triggers the wallet update), `listTransactions`.

Notifications — `notifications.functions.ts`: `getNotificationQuota`,
`sendMarketingNotification`, `listNotifications`.

Account — `account.functions.ts`: `deleteAccount` (sign out + admin delete).

Public — `enrollment.functions.ts`: `getPublicProgram`, `enrollCustomer`
(creates customer + pass; returns the Apple download URL or the Google save URL).

Server routes (external callers, not RPC):

- Apple PassKit Web Service, `webServiceURL = {APP_URL}/api/apple`:
  - `POST|DELETE /api/apple/v1/devices/$deviceLibraryIdentifier/registrations/$passTypeIdentifier/$serialNumber`
  - `GET /api/apple/v1/devices/$deviceLibraryIdentifier/registrations/$passTypeIdentifier?passesUpdatedSince=`
  - `GET /api/apple/v1/passes/$passTypeIdentifier/$serialNumber` (latest `.pkpass`, `Last-Modified`)
  - `POST /api/apple/v1/log`
- `GET /api/apple/passes/$serialNumber` — `.pkpass` download (guarded by the pass auth token).
- `POST /api/google/callback` — save / delete callback (signature-verified) → sets `installed_at`.

Wallet libraries (server-only): `lib/wallet/apple/pass.server.ts` (build + sign),
`lib/wallet/apple/apns.server.ts`, `lib/wallet/google/client.server.ts`,
`lib/wallet/google/callback.server.ts`.

## Configuration

`.env.example` gains: `SUPABASE_SECRET_KEY`, `APP_URL`, `APPLE_TEAM_ID`, `APPLE_PASS_TYPE_ID`,
`APPLE_WWDR_CERT`, `APPLE_SIGNER_CERT`, `APPLE_SIGNER_KEY`, `APPLE_SIGNER_KEY_PASSPHRASE`,
`APNS_KEY_ID`, `APNS_KEY`, `GOOGLE_ISSUER_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`,
`NOTIFICATIONS_PER_DAY`, `NOTIFICATIONS_PER_MONTH`. Both wallets are optional: the UI only
offers the providers that are configured, so the project stays self-hostable.

## Milestones (one PR each)

1. **Foundations**: DB schema + RLS + generated types, auth pages, `authMiddleware`, `_authed` layout.
2. **Programs**: CRUD, logo upload with browser resize, pass preview component.
3. **Passes**: enrollment page, manual issue, Apple pass signing + download, Google save link,
   Apple web service registration, Google callback.
4. **Points**: customers list, scan, adjust points, history, wallet updates (APNs + Google PATCH).
5. **Marketing notifications**: compose, quota, Apple `changeMessage` + push, Google `addMessage`.
6. **Polish**: account deletion, landing page, self-hosting docs.

Spikes before milestone 3: pass signing on Workers, APNs from Workers vs Supabase Edge Function.

## Open questions

1. Deployment: keep Cloudflare Workers (+ Edge Function for APNs) or switch to Node?
2. Wallets: Apple and Google from the start, or Apple first?
3. Drop the "event" card type? (Recommended.)
4. Notification limits: keep 1 / 24 h and make the monthly cap configurable?
5. UI language: English only, French only, or i18n (FR + EN) from the start?
6. Data migration from the existing Loylo database, or fresh start?
