# Loylo OSS — MVP plan

Status: **in progress**: PRs 1–10 merged, next is PR 11 (`feat/account`). See [Status and handoff](#status-and-handoff).

This document is the shared context for building Loylo OSS: what we build, what we decided,
why, and in which order. Read it before starting any PR.

## Status and handoff

Read this section first when picking up the work in a new session.

| # | Branch | GitHub PR | State |
| --- | --- | --- | --- |
| 1 | `feat/apple-pass-signing` | #2 | merged |
| 2 | `feat/apple-push` | #3 | merged |
| 3 | `feat/google-wallet` | #4 | merged |
| 4 | `feat/database-foundations` | #5 | merged |
| 5 | `feat/auth` | #6 | merged |
| 6 | `feat/programs` | #7 | merged |
| 7 | `feat/enrollment` | #9 | merged |
| 8 | `feat/wallet-web-services` | #10 | merged |
| 9 | `feat/points` | #12 | merged |
| 10 | `feat/marketing-notifications` | #14 | merged |
| 11 | `feat/account` | — | **next** |

How the owner works: one PR at a time; the owner merges it (even while the Cloudflare build
is red, see below) and says when to start the next one. Do not start the next PR without the go.

### Decisions taken during implementation

These refine or override the sections below.

- **APNs runs in the Worker** (no Edge Function): deployed Workers reach APNs over HTTP/2
  through `fetch`; local workerd cannot, so pushes only work once deployed.
- **The `WalletProvider` interface is `WalletSync`** (`src/features/wallet-sync/`): the name
  `WalletProvider` already was the `'apple' | 'google'` type, after the `wallet_provider` enum.
- **Only what is used**: `citext` and the `wallet_provider` enum arrived with PR 7,
  `wallet_passes.installed_at` / `uninstalled_at` with PR 8, `programs.wallet_message` with PR 10.
  No `google_class_id` or `google_object_id` column: the class ID is
  `{GOOGLE_ISSUER_ID}.{program id}`, the object ID `{GOOGLE_ISSUER_ID}.{wallet pass id}`.
- **Explicit grants**: Supabase is moving the Data API to opt-in grants, so every migration
  grants table and column privileges itself (nothing for `anon`), next to RLS.
- **Internal SQL helpers** live in the unexposed `private` schema (`private.set_updated_at()`).
- **Session cookies are `HttpOnly`** (`src/lib/supabase/cookies.server.ts`): only the server
  handles the session, so the browser Supabase client is always anonymous.
- **Three Supabase clients**: `createUserClient()` (session, RLS, the default),
  `createAdminClient()` (secret key, public flows only), `createAuthClient()` (secret key +
  `Sb-Forwarded-For`, Auth endpoints only, so Supabase rate-limits per visitor IP instead of
  per Worker IP).
- **Auth hardening**: `authMiddleware` (`getClaims()`) on every private server function,
  TanStack Start's built-in `createCsrfMiddleware` for server functions (`src/start.ts`), a Workers
  rate limiter `AUTH_RATE_LIMITER` (10/min per IP and action), no account enumeration, in-app
  redirects only. Public flows use `ENROLLMENT_RATE_LIMITER` (20/min per IP and action:
  enrollments, pass links); helpers in `src/lib/rate-limit.server.ts`.
- **Auth emails** use `token_hash` links to `/auth/confirm` (templates in `supabase/templates`).
- **Program images** are generated in the browser (`program-images.ts`) and checked on the server
  (PNG signature, exact dimensions, ≤ 1 MB). Each logo version has its own folder
  `{owner}/{program}/{version}` in `program-assets`: `apple-icon.png`, `apple-icon@2x.png`,
  `apple-logo.png`, `apple-logo@2x.png`, `google-logo.png`.
- **Wallets are optional**: `getOptionalAppleWalletConfig()` / `getOptionalGoogleWalletConfig()`
  return `null` when a wallet is not configured (a partial configuration still fails);
  `getAvailableWallets()` drives which buttons the pages show.
- **Google class sync never fails a request**: it is logged and reported in the UI; saving again
  retries. Google classes cannot be deleted through the API.
- **The database generates pass secrets and welcome points**: `serial_number` (128 random bits,
  the QR code content) and `authentication_token` (256 random bits) come from column defaults,
  `members.points` from a trigger; none of them is insertable through the Data API.
- **Every pass has an `authentication_token`**, Apple or Google: it is Apple's
  `authenticationToken` and the secret of the pass link
  `/api/{apple|google}/passes/{serial}?token={token}`. The Apple link returns the `.pkpass`; the
  Google link syncs the class and the object, then redirects to the save link. Passes are rebuilt
  from the database on every download, so opening a link again also retries after a failure.
- **Public enrollment refuses an email already enrolled** (no email verification, so it would
  hand that member's pass and points to anyone typing the email). `enroll_member` (service role
  only) creates new members; reinstalls and wallet changes go through the merchant's manual issue
  (`issue_wallet_pass`, RLS), which reuses the member and keeps their points.
- **`citext` in SQL functions**: under `search_path = ''`, `=` on `citext` is case-sensitive;
  compare with `operator(extensions.=)`.
- **Pass content version** = the latest of the pass's `created_at`, its member's `updated_at` and
  its program's `updated_at` (`list_apple_device_passes`, `passContentUpdatedAt`). It drives
  Apple's `passesUpdatedSince` tags (microsecond timestamps) and `Last-Modified`: changing points
  or a program marks the passes as updated without writing to `wallet_passes`, and install-state
  changes do not make devices download passes again. `If-Modified-Since` is ignored (second
  precision would miss two changes within one second).
- **Install state**: a pass is installed while `installed_at` is set and `uninstalled_at` is not.
  Apple: installed while at least one device is registered (`register_apple_device`,
  `unregister_apple_device`, which also forgets devices without passes). Google: signed save /
  delete callbacks (`record_wallet_pass_install`, idempotent).
- **Apple devices are server only**: `apple_devices` / `apple_registrations` have RLS on, no
  policies, grants for `service_role` only; read push tokens with the admin client after checking
  the merchant's access with the user client.
- **Points ledger written by triggers**: `point_transactions` rows only come from triggers on
  `members` (`private.record_point_transaction`, security definer): `welcome` on insert (when the
  program grants welcome points), `adjustment` on every change of `members.points`, with
  `created_by = auth.uid()` (null for public enrollments). Merchants may update `members.points`
  (column grant + RLS) but never write the ledger, so a member's deltas always add up to their
  balance. `adjust_points` is one `update ... set points = points + delta` (no lost updates);
  `members_points_check` refuses a negative balance, shown as "not enough points".
- **Members list**: `list_members()` (security invoker) searches first name + last name and email
  with `ilike` (`%`, `_` and `\` escaped) and pages newest first on `(created_at, id)`
  (`members (program_id, created_at, id)` index). It returns `setof members`, so PostgREST embeds
  the passes. The page cursor `{createdAt}_{id}` and the search live in the URL (`?after=`, `?q=`).
- **Wallet sync**: `WalletSync.syncMemberPasses({ points, passIds })` per wallet;
  `syncMemberWallets()` loads the member's passes with the user client (RLS), runs both wallets
  and returns `synced | skipped | failed`. It never throws: the change is saved anyway, the member
  page shows a retry button (`retryWalletSync`), and any later sync sends the current state. Apple:
  one APNs push per device of the passes (admin client); `unregistered` removes that registration
  (`unregister_apple_device`, which updates the install state). Google: `setLoyaltyPoints` on each
  object; 404 (pass link never opened, the object is created then) counts as skipped. APNs is
  optional (`getOptionalApplePushConfig`).
- **Scanning**: `BarcodeDetector` when it reads QR codes, otherwise `jsqr`, loaded on demand
  (Safari, Firefox, desktop Chrome). The "Card code" field also takes USB / Bluetooth barcode
  scanners, which type the code. Serial numbers are matched case-insensitively.
- **Dates** render in UTC on the server and in the viewer's time zone after hydration
  (`FormattedDate`), which avoids hydration mismatches.
- **Sending rules in the database**: `create_notification()` locks the program row, refuses a
  second message within 24 hours (`LY001`) and more than the monthly cap per calendar month, UTC
  (`LY002`), records the message and sets `programs.wallet_message`, which merchants cannot
  update. It is server only: the cap is the deployment's `NOTIFICATIONS_MONTHLY_CAP` (default 4,
  0 turns messages off), so `sendNotification` reads the program with the user client (RLS), then
  calls it with the admin client. `notification_usage()` gives the page the same counts.
- **Message delivery**: Apple passes show `wallet_message` in their back field with
  `changeMessage: "%@"`; setting it bumps `programs.updated_at`, every device of the program is
  pushed (`list_program_apple_devices`, read 1000 devices at a time) and Wallet shows the new text
  as a notification. Google: `addMessage` with `TEXT_AND_NOTIFY` (notifies Android holders), then
  the class is replaced with the message as its only `TEXT` message, under the fixed ID
  `program-message`: a class keeps at most 10 messages and `update` replaces them. Every class
  upsert carries the current message, so pass links and program edits keep it.
- **Program-level sync**: `WalletSync.syncProgramPasses` (design changes) and
  `sendProgramMessage`. Saving a program now pushes its Apple passes; `retryProgramWalletSync`
  syncs again without notifying (Apple only notifies a change the device has not shown, Google
  class updates carry `TEXT` messages).
- **No delivery counts**: the planned `notifications.delivered_count` / `failed_count` were left
  out: a push accepted by APNs or a Google message reaches devices later, so the counts would not
  mean "delivered". The page shows the send result and offers a retry instead.

### Code map

| Path | Content |
| --- | --- |
| `src/lib/config.server.ts` | Env validation with Zod, read per request (`getSupabaseConfig`, `getSupabaseAdminConfig`, `getAppleWalletConfig`, `getOptionalAppleWalletConfig`, `getApplePushConfig`, `getOptionalApplePushConfig`, `getGoogleWalletConfig`, `getOptionalGoogleWalletConfig`, `getNotificationsConfig`) |
| `src/lib/wallet/apple/` | `pass-json.ts` (pure builder), `pkpass.server.ts` (signing), `apns.server.ts` (pushes), `pkpass.server.test.ts` (the only test) |
| `src/lib/wallet/google/` | `objects.ts` (class / object builders), `client.server.ts` (API client, save URL), `callback.server.ts` (callback verification) |
| `src/lib/supabase/` | clients, `cookies.server.ts`, generated `database.types.ts` |
| `src/lib/forms.ts`, `src/components/form-*.tsx` | `useSchemaForm` (Zod → field errors), `FormField`, `FormAlert` |
| `src/features/auth/` | schemas, server helpers, `authMiddleware`, server functions, `AuthCard` |
| `src/features/programs/` | schemas (`PROGRAM_IMAGES`), server helpers, server functions, `ProgramForm`, `PassPreview`, `ProgramCard` |
| `src/features/members/` | member / wallet / points schemas, server functions (`issuePass`, members list, member, scan lookup, points, history), `members.server.ts` (views, install state), `wallet-passes.server.ts` (pass links, `.pkpass` build, Google save link), `MemberPassForm`, `MemberList`, `PointsForm`, `QrScanner`, `WalletStateBadge` |
| `src/features/wallet-sync/` | `WalletSync` interface and `combineSyncResults` (`wallet-sync.ts`), Apple and Google implementations, `syncMemberWallets`, `syncProgramWallets`, `sendProgramMessageToWallets` |
| `src/features/notifications/` | message schema, quota view (`toNotificationQuota`), server functions (quota, history, send), `NotificationForm`, `NotificationPreview` |
| `src/features/enrollment/` | public server functions `getPublicProgram`, `enroll` |
| `src/lib/` (other) | `rate-limit.server.ts`, `supabase/errors.server.ts` (`databaseError`), `app-origin.ts` (isomorphic origin), `http.ts` |
| `src/components/` | `qr-code.tsx` (SVG, `uqr`), `copy-button.tsx`, `formatted-date.tsx`, shadcn `ui/` |
| `src/routes/_guest*`, `src/routes/_authed*` | signed-out and signed-in layouts and pages (program overview with members, member, scan, messages, share, issue a card, settings); `src/routes/auth/confirm.ts` |
| `src/routes/join/$programId.tsx` | public enrollment page |
| `src/routes/api/{apple,google}/passes/$serialNumber.ts` | pass links |
| `src/features/wallet-services/`, `src/routes/api/apple/v1/`, `src/routes/api/google/callback.ts` | Apple PassKit Web Service, Google save / delete callback |

Code conventions: server functions use `.validator()` (`inputValidator()` is deprecated in this
TanStack Start version); a foreign or unknown ID throws `notFound()`; errors shown to users are
thrown as `Error` with a safe message and details are logged. `useSchemaForm` includes the clicked
submit button's `name` / `value` (one button per wallet).

### Local development and verification

Each PR so far was verified end to end before opening it. The environment used:

1. Docker: start the daemon if needed (`dockerd &`).
2. Supabase: `bunx supabase start -x realtime,imgproxy,studio,edge-runtime,logflare,vector,supavisor`
   (keeps db, auth, storage, REST, Mailpit). If an image cannot be pulled from ECR or GHCR, pull
   it from Docker Hub and tag it as `public.ecr.aws/supabase/<name>:<tag>`: `supabase/realtime`,
   and `postgrest/postgrest` for PostgREST. Docker Hub may answer 429: wait and retry.
3. `bunx supabase db reset` applies the migrations, `bun run gen:types` regenerates the types,
   `bunx supabase db advisors --local` checks security.
4. `.env.local` (git-ignored) from `bunx supabase status -o json`: `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, plus wallet variables when needed.
   Without Apple credentials, generate a stand-in WWDR authority and a Pass Type ID certificate
   with openssl: passes are then signed for real and `openssl cms -verify` checks them. A fake
   Google service account exercises the Google error paths.
5. `bun run dev`, then drive the app with Playwright and Chromium (`/opt/pw-browsers`), with
   scripts kept outside the repo. Mailpit (`http://127.0.0.1:54324`) receives auth emails; check
   rows and RLS with `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Users can be
   created confirmed through the Auth admin API (`POST /auth/v1/admin/users` with the secret key).
   The scan page runs with a fake camera: Chromium's `--use-fake-device-for-media-stream
   --use-file-for-fake-video-capture=card.y4m` with a Y4M video of a QR code (grayscale frames
   drawn from `uqr` are enough). Wallet sync paths (APNs `410`, Google `404`, the message flow,
   1000+ devices) were checked with Bun scripts that import the `wallet-sync.server.ts` functions
   and mock `fetch` for Apple and Google only; Google needs an HTTPS logo URL, so pass them a
   Supabase client created with an `https://` URL (it only builds public URLs). Backdate
   `notifications.created_at` with `psql` to test the sending rules.
6. Before pushing: `bunx tsc --noEmit`, Biome on the changed files, `bun run build` (and check that
   no server code ends up in `dist/client`), `bun run test`.

Gotchas: the auth rate limiter blocks sign-in after 10 attempts per minute (space out scripted
sign-ins); the session cookie lands a moment after the dashboard shows (wait for it before the
next `goto`); TanStack Router updates the URL before the next page renders (wait for content, not
the URL); wait for `networkidle` before clicking, or forms submit natively before hydration, and
abort `**/__tsd/**` requests first (the devtools' event stream never lets the network go idle);
the TanStack devtools panel adds labelled elements, so select inputs by their `#field-*` id;
`supabase.com`, `developers.google.com` and the shadcn registry may be unreachable from the
agent environment: read Supabase docs from `raw.githubusercontent.com/supabase/supabase`, and
generate shadcn components from the shadcn GitHub sources with the `base-luma` style
(`apps/v4/registry/styles/style-luma.css`).

### Known issues and open items

- **Cloudflare Workers Builds fails on every PR and on `main`**. The cause is only visible in
  the Cloudflare dashboard build logs; share a log to fix it. The Worker was renamed to
  `loylo-oss` to match the Cloudflare project; `wrangler.jsonc` also has the `AUTH_RATE_LIMITER`
  and `ENROLLMENT_RATE_LIMITER` bindings. Nothing has been deployed yet.
- **Hosted Supabase setup** (owner): copy `supabase/templates/*.html` into Authentication >
  Email Templates, set the Site URL, enable IP address forwarding (Authentication > Rate Limits).
- **Google class sync** needs an HTTPS logo URL (it fails with the local `http` Supabase URL), so
  locally the Google pass link answers 503.
- **Forms submitted before hydration** fall back to a native `GET`, which puts the fields in the
  URL (the password on `/login`, name and email on `/join`). Consider `method="post"` or disabling
  submit buttons until hydration.
- Biome reports formatting issues in starter files (`biome.json` schema version, `button.tsx`,
  `router.tsx`, `__root.tsx`); they predate the project work and were left untouched.
- **Program-wide pushes run inside the request** (sending a message, saving a program): one APNs
  request per device, 6 at a time. Each counts against the Worker's subrequest limit, so a large
  program needs a queue (Cloudflare Queues) to reach every device.
- **Google message flow checked with mocks only** (no issuer account here): on a real account,
  check that the notification still arrives although the class is replaced right after
  `addMessage`.
- Sending the same text twice gives no Apple notification: Wallet only notifies changed fields.
- **Locally, Apple pushes fail** (workerd has no HTTP/2, and the agent proxy answers `403`), so the
  member page shows its "cards could not be updated" warning whenever an Apple device is
  registered; Google syncs fail the same way with a fake service account.
- **Real devices** need HTTPS for the Apple web service (or "Allow HTTP Services" in the iPhone's
  developer settings), real Apple certificates and a Google issuer account; APNs only works from a
  deployed Worker.

### Notes for PR 11 (`feat/account`)

- Account page: change email (confirmation email, `supabase/templates`), change password
  (`updatePassword` exists), delete the account.
- Deleting: Supabase forbids deleting storage objects in SQL, so remove the user's images
  (`program-assets/{user id}/...`) through the Storage API first; deleting the user then cascades
  to programs, members, passes, the points ledger and notifications. Use the admin client
  (`auth.admin.deleteUser`) after checking the session, and sign the user out: deleting a user
  does not revoke their access tokens. Google classes cannot be deleted; Apple devices drop their
  registrations with the passes (cascade) and unregister later.
- Landing page (`/`) and a README self-hosting guide: every variable of `.env.example` (including
  `NOTIFICATIONS_MONTHLY_CAP`), the hosted Supabase setup listed in the known issues, the
  Cloudflare rate limiter bindings, Apple and Google credentials.

## Context

Loylo is a digital loyalty card product made of two private repos:

- `loylo-api`: AdonisJS backend (REST API, Inertia pages for the public enrollment form,
  Apple / Google Wallet integration).
- `loylo-app`: Ionic / Capacitor mobile app for merchants, talking both to the API and
  directly to Supabase.

Loylo OSS is a **web-only, open-source rewrite** built on **TanStack Start** (deployed on
**Cloudflare Workers**) and **Supabase**, with the shadcn design system already set up on `main`.
It starts **from scratch**: no data is imported from Loylo, and the old repos are a functional
reference only, never code to copy. The goal is to maximize code quality and data modeling quality.

## Decisions

| Topic | Decision |
| --- | --- |
| Hosting | Cloudflare Workers (kept, even with the constraints below) |
| Wallets | Apple Wallet and Google Wallet, both from the start |
| Card types | Loyalty points only ("event" type dropped for now) |
| Monetization | None (RevenueCat paywall dropped) |
| UI language | English only |
| Marketing limits | 1 message / 24 h per program, monthly cap from an env var |
| Data | Fresh start, no import from Loylo |
| Logo background removal | Dropped |
| Validation | Zod everywhere (env, server function inputs, forms, wallet payloads) |
| Wallet code | Apple and Google split behind a common `WalletProvider` interface |
| Tests | Only one: validation of generated `.pkpass` files, run in the Workers runtime |
| CI | None |
| Migrations | In `supabase/migrations`, applied locally with the Supabase CLI |

## MVP scope

1. Merchant sign up / sign in with email + password (plus password reset).
2. Loyalty program creation: name, color, logo, initial points.
3. Pass issuance for customers, self-service (public enrollment link / QR code) and manual
   (the merchant issues a pass for a given customer).
4. Points: scan a pass, add / redeem points, history.
5. Marketing notifications pushed to every wallet holding the program's pass.

Out of scope: "event" cards, RevenueCat paywall, background removal, push notifications to
the merchant's phone (FCM), Capgo live updates, articles / blog, i18n.

## How the original works (reference)

| Flow | Original implementation |
| --- | --- |
| Create card | `POST /cards/create`: uploads the logo, `sharp` resizes icons, `@imgly` removes the background, writes an Apple `pass.json` template into the `apple-passes` bucket, creates a Google Wallet `loyaltyClass`, inserts a `card` row. |
| Enrollment | Public page `/form/:id`. The customer submits name, email, wallet → upsert `client`, create `client_card` (serial number) → returns a signed `.pkpass` or a Google "save" URL. |
| Manual issue | `POST /cards/generate`: generates a `.pkpass`, uploads it to `tmp-passes`, returns a signed URL. |
| Apple Wallet updates | PassKit Web Service (`/v1/devices/...`, `/v1/passes/...`) + `device` / `registration` tables + APNs push (`.p8` token auth). |
| Google Wallet updates | REST `PATCH loyaltyObject`; save / delete callback verified with ECv2 signatures. |
| Points | The app scans the pass QR code (= serial number), then `+50`, `+100` or reset. |
| Marketing | Apple: rewrites `backFields[0]` (with `changeMessage`) of the template and pushes every device. Google: `loyaltyClass/addMessage` with `TEXT_AND_NOTIFY`. 1 message / 24 h. |

## Review of the original code

These findings drive the design principles below.

1. **Schema not versioned.** No migrations, no generated types (`any` everywhere), RLS only
   visible in the dashboard. → Everything in `supabase/migrations`, types generated with `supabase gen types`.
2. **Two backends, split authorization.** The app queries tables directly *and* calls the API;
   the API skips ownership checks (`cards/*/update`, `cards/generate`), so any signed-in user can
   change anyone's points. → One entry point (server functions), RLS as the authorization
   boundary, the user-scoped Supabase client by default.
3. **Storage used as a database.** Apple `pass.json` templates live in a bucket and are mutated
   (marketing message). → Passes are a pure function of DB rows: `buildApplePass(program, member, pass)`.
4. **Wallet branching leaks everywhere.** The UI picks `cards/apple/update` vs `cards/google/update`.
   → One domain operation (`adjustPoints`), wallets behind a `WalletProvider` interface.
5. **Side effects mixed with writes, errors swallowed.** Partial states (customer created but no
   pass), un-awaited `Promise.all`, Google updated before the DB on one path and after on the other,
   raw DB errors returned to the client. → DB transaction first (RPC), then idempotent wallet sync;
   one error type and shape; never return internal errors.
6. **Business rules duplicated or client-side.** Notification quota checked in the UI with a
   hardcoded `5`, race-prone decrementing counter never reset. → Rules enforced in SQL functions;
   the UI only displays their result.
7. **Uniqueness by retry loops and `Math.random`.** 10-digit guessable serial numbers, a uniqueness
   check against a non-existent column. → Cryptographic random tokens + unique constraints.
8. **Hardcoded configuration.** Team id, key id, pass type id, Firebase project, French labels,
   `fr-FR` locale. → Typed config validated with Zod, read per request (Workers).
9. **Monolithic handlers.** `create_cards_controller` slugifies, processes images, uploads,
   calls Google and writes the DB in one function; pass generation duplicated in 3 places.
   → Layers below, small pure functions.
10. **Navigation state in `localStorage`** (`cardId`, `fromValidation`), data fetching in
    `useEffect`, fake `setTimeout` refreshes. → State in the URL, data in loaders / server functions.
11. **Disk temp files** (`storage/`). → In-memory buffers only.
12. **`is_activated` flag** flipped to false by any single device unregistering. → Install state
    derived from registrations / callbacks.
13. **Overly strict validation.** Names of at least 3 characters ("Li" rejected), forced
    capitalization ("McDonald" → "Mcdonald"). → Permissive on names, strict on what matters
    (email, points, color).
14. **Global `client` table keyed by email**, shared across merchants. → Members scoped per program.
15. **Apple web service incomplete.** `passesUpdatedSince` ignored, `lastUpdated` always "now".
    → A pass content version (latest of the pass, member and program timestamps) drives the spec.
16. **Secrets committed in `loylo-api`**: Apple signer key / cert, APNs `.p8` key, RevenueCat
    webhook token hardcoded. → Every secret from env vars; the leaked keys must be revoked
    (see Prerequisites).

## Design principles

- **Feature folders** under `src/features/<feature>/`, with layers:
  `routes` (UI) → `*.functions.ts` (thin: middleware, Zod validation, call a use case) →
  `*.server.ts` use cases → `db` (typed Supabase queries / RPCs) and `wallet` adapters.
- **Pure builders** (pass JSON, Google objects, quota math, signature verification) do no I/O.
- **Zod schemas shared** between the form and the server function (`*.schemas.ts`).
- **The database owns invariants**: constraints, enums, checks, SQL functions for multi-row writes.
- **Writes are transactional, side effects are retryable**: the RPC commits, then the wallet
  sync runs. It is idempotent, so a failure can be retried without touching the data.
- **Least privilege**: the Supabase secret key is only used by public endpoints that have no
  user (enrollment, Apple / Google web services), in `*.server.ts` files.
- **Auth enforced server-side** in a function middleware; route `beforeLoad` guards are UX only.
- **Vertical slices**: each PR ships its migration + server + UI for one feature.
- Follow the local TanStack Start skills (`bun run intent list` / `bun run intent load ...`) and
  the Supabase skills in `.claude/skills` when implementing.

## Platform constraints (Cloudflare Workers)

| Need | Plan |
| --- | --- |
| Image resize / icons | Browser canvas before upload (`icon.png`, `icon@2x.png`, `logo.png`). `sharp` cannot run on Workers. |
| Pass signing (PKCS#7) | `passkit-generator` (`node-forge`, pure JS) with certs from env. Proven in PR 1 (test in `workerd`). |
| Google Wallet auth + save JWT | `jose` (WebCrypto) instead of `google-auth-library` / `jsonwebtoken`. |
| Google callback verification | WebCrypto ECDSA P-256 instead of Node `crypto`. |
| APNs push (HTTP/2 required) | Deployed Workers reach APNs through `fetch`; local workerd cannot (cloudflare/workerd#4841), so pushes only work once deployed. No Edge Function needed. |
| Marketing fan-out | Pushes in the request, 6 at a time (PR 10); Cloudflare Queues if a program's device count exceeds per-request subrequest limits. |
| Env vars | Not available at module scope: read per request (or via `cloudflare:workers` `env`), validated with Zod. |

## Database (Supabase, `public` schema, RLS on every table)

Points belong to the **member** (the customer's membership in a program), not to a wallet object.
A member can have several passes (reinstall, phone change, Apple → Google) without losing points,
which removes the original "delete and recreate `client_card`" hack.

```
auth.users ─1..n─ programs ─1..n─ members ─1..n─ wallet_passes ─n..n─ apple_devices
                     │               │                      (apple_registrations)
                     │               └─1..n─ point_transactions
                     └─1..n─ notifications
```

- **`programs`**: `id uuid pk default gen_random_uuid()`, `owner_id uuid not null → auth.users on delete cascade`,
  `name text check (char_length between 1 and 64)`, `background_color text check (~ '^#[0-9a-f]{6}$')`,
  `logo_path text`, `initial_points int check (>= 0)`, `created_at`, `updated_at`, `wallet_message
  text check (char_length between 1 and 100)` (PR 10, set by `create_notification`). The Google
  class ID is deterministic (`{GOOGLE_ISSUER_ID}.{program id}`), so it is not stored.
- **`members`**: `id uuid`, `program_id → programs on delete cascade`, `email citext`,
  `first_name text`, `last_name text` (1–50 characters), `points int not null check (points >= 0)`
  (set from the program's welcome points on insert), `created_at`, `updated_at`;
  `unique (program_id, email)`.
- **`wallet_passes`**: `id uuid`, `member_id → members on delete cascade`,
  `provider wallet_provider ('apple' | 'google')`, `serial_number text unique` (16 random bytes,
  QR content), `authentication_token text` (32 random bytes, every pass), `created_at`,
  `updated_at`, `installed_at timestamptz`, `uninstalled_at timestamptz` (PR 8). The content
  version that drives Apple `passesUpdatedSince` / `Last-Modified` comes from the member and the
  program (see the decisions above).
- **`point_transactions`** (append-only, written by triggers on `members`, select-only for
  merchants): `id bigint identity`, `member_id`, `kind point_transaction_kind ('welcome' |
  'adjustment')`, `delta int check (delta <> 0)`, `balance_after int check (>= 0)`,
  `created_by uuid → auth.users on delete set null`, `created_at` (PR 9).
- **`apple_devices`**: `id`, `device_library_identifier text unique`, `push_token text`,
  `created_at`, `updated_at`.
- **`apple_registrations`**: `device_id`, `pass_id`, `created_at`, `pk (device_id, pass_id)`.
- **`notifications`** (append-only, written by `create_notification`): `id bigint identity`,
  `program_id`, `message text check (char_length between 1 and 100)`,
  `sent_by uuid → auth.users on delete set null`, `created_at` (PR 10).

SQL functions (`security invoker`, so RLS still applies):

- `adjust_points(member_id, delta)`: one `update members set points = points + delta ... returning`
  (the check constraint rejects negative balances), returns the new balance (null for a foreign
  member). No lost updates. A trigger writes the ledger row; the new `members.updated_at` marks
  the passes as updated.
- `list_members(program_id, search, after_created_at, after_id, page_size)`: a page of members,
  newest first, optionally filtered by name or email.
- `create_notification(program_id, message, sent_by, monthly_cap)` (server only): locks the
  program row, checks the 24 h rule and the monthly cap, inserts, sets `programs.wallet_message`.
  No double send. `notification_usage(program_id)`: messages this month and the last send.
- `list_program_apple_devices(program_id)` (server only): one row per device, with its passes of
  the program.

Also: `updated_at` triggers, indexes on every FK, `members (program_id, created_at, id)` for
pagination, `pg_trgm` index for name / email search if needed. RLS: merchants (`to authenticated`)
reach rows whose program has `owner_id = (select auth.uid())`; `apple_*` tables have RLS on and
no policies (server-only).

**Storage**: public bucket `program-assets` (Google Wallet fetches the logo by URL), path
`{owner_id}/{program_id}/{file}`, write policies limited to the owner's folder, size and MIME
limits on the bucket. No pass templates and no temporary pass bucket: passes are built from DB
data and streamed directly.

## Pages (file routes)

The PR column says which PR ships each page; pages up to PR 10 exist.

| Route | Purpose | PR |
| --- | --- | --- |
| `/` | Landing (minimal for now, finished in PR 11) | 5 / 11 |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Merchant auth | 5 |
| `/auth/confirm` (server route) | Auth email links | 5 |
| `/join/$programId` | Public enrollment → Add to Apple Wallet / Add to Google Wallet | 7 |

Merchant (`_authed` layout):

| Route | Purpose | PR |
| --- | --- | --- |
| `/dashboard` | List of programs, "create" CTA | 6 |
| `/programs/new` | Create a program with live pass preview | 6 |
| `/programs/$programId` | Members list (search, install state, pagination), pass preview, scan / issue / share links | 6 / 9 |
| `/programs/$programId/members/new` | Issue a pass manually (QR code of the pass link) | 7 |
| `/programs/$programId/members/$memberId` | Balance, add / redeem points, history | 9 |
| `/programs/$programId/scan` | Camera QR scan (`BarcodeDetector` with a JS fallback) | 9 |
| `/programs/$programId/share` | Enrollment link + QR code | 7 |
| `/programs/$programId/notifications` | Compose, preview, quota, history | 10 |
| `/programs/$programId/settings` | Edit / delete the program | 6 |
| `/account` | Email, password, delete account | 11 |

## Server functions and routes

Done (PRs 5–10):

- `auth`: `signUp`, `signIn`, `signOut`, `requestPasswordReset`, `updatePassword`, `getCurrentUser`.
- `programs`: `listPrograms`, `getProgram`, `createProgram`, `updateProgram`, `deleteProgram`,
  `retryProgramWalletSync`.
- `members`: `issuePass`, `listAvailableWallets`, `listMembers`, `getMember`, `findMemberBySerial`,
  `adjustPoints`, `retryWalletSync`, `listTransactions`.
- `enrollment` (public): `getPublicProgram`, `enroll`.
- `notifications`: `getNotificationQuota`, `sendNotification`, `listNotifications`.

To do:

- `account` (PR 11): `deleteAccount`.

Server routes (external callers), all done (PRs 7–8):

- Apple PassKit Web Service, `webServiceURL = {APP_URL}/api/apple`:
  - `POST | DELETE /api/apple/v1/devices/$deviceLibraryIdentifier/registrations/$passTypeIdentifier/$serialNumber`
  - `GET /api/apple/v1/devices/$deviceLibraryIdentifier/registrations/$passTypeIdentifier?passesUpdatedSince=`
  - `GET /api/apple/v1/passes/$passTypeIdentifier/$serialNumber`
  - `POST /api/apple/v1/log`
- `GET /api/apple/passes/$serialNumber?token=`: `.pkpass` download (pass link).
- `GET /api/google/passes/$serialNumber?token=`: redirect to the Google save link (pass link).
- `POST /api/google/callback`: save / delete callback (signature-verified).

## Configuration

`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_URL`,
`APPLE_TEAM_ID`, `APPLE_PASS_TYPE_ID`, `APPLE_WWDR_CERT`, `APPLE_SIGNER_CERT`, `APPLE_SIGNER_KEY`,
`APPLE_SIGNER_KEY_PASSPHRASE`, `APNS_KEY_ID`, `APNS_KEY`, `GOOGLE_ISSUER_ID`,
`GOOGLE_SERVICE_ACCOUNT_JSON`, `NOTIFICATIONS_MONTHLY_CAP`.

## Prerequisites (owner side)

- **Revoke the secrets leaked in `loylo-api`** (Apple signer cert / key, APNs `.p8`, RevenueCat
  webhook token) and generate new ones.
- **Apple**: a Pass Type ID with its signing certificate (`.p12` or cert + key), the WWDR
  certificate, and an APNs `.p8` key with its Key ID. Needed to try passes on a real iPhone.
- **Google**: a Google Wallet issuer account (Issuer ID) and a service account JSON key.
- Docker + Supabase CLI to apply migrations locally.

The automated `.pkpass` test does not need real certificates (it generates test ones).

## Working agreements

- Everything in English (code, comments, commits, PRs). Conventional Commits, no AI attribution.
- One branch and one PR per row of the table below, named as shown.
- Each PR adds its own timestamped migration in `supabase/migrations` (`supabase migration new <name>`).
  Apply locally with `supabase db reset`, then `bun run gen:types` to regenerate
  `src/lib/supabase/database.types.ts`.
- No CI. The only automated test is the `.pkpass` validation test.
- Verify each PR end to end on a local Supabase before opening it (see [Local development and verification](#local-development-and-verification)).

## Pull requests

PRs 1–3 have no database dependency and prove the risky parts on Workers first.

| # | Branch | Content | Migration |
| --- | --- | --- | --- |
| 1 | `feat/apple-pass-signing` | Typed config (Zod, per request), Apple `pass.json` builder (Zod), signing with `passkit-generator`, the `.pkpass` validation test, demo route returning a `.pkpass`. | — |
| 2 | `feat/apple-push` | APNs adapter in the Worker (`.p8` token auth with `jose`), per-device results (sent / unregistered / failed). | — |
| 3 | `feat/google-wallet` | Google adapter with `jose`: service-account token, class / object builders (Zod), save JWT, object patch, `addMessage`, callback signature verification (WebCrypto). Demo route. | — |
| 4 | `feat/database-foundations` | `private.set_updated_at()`, `programs` + explicit grants + RLS, `program-assets` bucket + policies, Supabase CLI + `gen:types` script, typed user / admin / browser clients, removal of the starter demo. | `create_programs` |
| 5 | `feat/auth` | Sign up, sign in, sign out, forgot / reset password, `/auth/confirm`, `authMiddleware`, `_authed` layout, auth settings in `config.toml`. | — |
| 6 | `feat/programs` | Dashboard, create program with live pass preview and browser image resize, Google class creation, settings (edit / delete). | — |
| 7 | `feat/enrollment` | `citext`, `wallet_provider` enum, `members` + `wallet_passes`, `/join/$programId`, manual issue, `.pkpass` download route, Google save link, share page (link + QR). | `create_members_and_wallet_passes` |
| 8 | `feat/wallet-web-services` | `apple_devices` + `apple_registrations`, Apple PassKit Web Service routes, Google callback route, install state. | `create_apple_registrations` |
| 9 | `feat/points` | `point_transactions` + `adjust_points()`, members list, member page (balance, add / redeem, history), scan page, `WalletProvider` interface and wallet sync after each change. | `create_point_transactions` |
| 10 | `feat/marketing-notifications` | `programs.wallet_message`, `notifications` + `create_notification()`, compose page with preview and history, Apple `changeMessage` + push, Google `addMessage`. | `create_notifications` |
| 11 | `feat/account` | Account page (email, password, delete account), landing page, README for self-hosting. | — |

### Details and done criteria

1. **`feat/apple-pass-signing`**
   - `src/lib/config.server.ts`: Zod schema for env vars, read per request.
   - `src/lib/wallet/apple/pass.server.ts`: pure `pass.json` builder + signing.
   - Test with Vitest + `@cloudflare/vitest-pool-workers` (runs in `workerd`): manifest SHA-1
     hashes match the files, PKCS#7 signature verifies, required `pass.json` fields present.
   - Done when the test passes in `workerd` and the demo `.pkpass` opens on an iPhone.
2. **`feat/apple-push`**
   - `src/lib/wallet/apple/apns.server.ts` (ES256 provider token via `jose`), runs in the Worker.
   - Done when the module sends correct requests (checked with a mocked `fetch`); a real push
     to a device is checked once the Worker is deployed with registered passes (PR 8–9).
3. **`feat/google-wallet`**
   - `src/lib/wallet/google/` (builders, API client, callback verification). The
     `WalletProvider` interface is defined in PR 9, where both wallets are first used.
   - Done when the demo save link adds a pass to Google Wallet and a points patch shows up.
4. **`feat/database-foundations`**
   - Done when `supabase db reset` applies cleanly, types are generated, and the starter
     `instruments` demo is gone.
5. **`feat/auth`**
   - Done when a merchant can sign up, confirm the email, sign in, reset the password, and
     protected routes redirect when signed out.
6. **`feat/programs`**
   - Done when a merchant creates, edits and deletes a program with its logo, and the Google
     class exists.
7. **`feat/enrollment`**
   - Done when a customer enrolls from the public link and adds the pass to Apple or Google
     Wallet, and a merchant can issue a pass manually.
8. **`feat/wallet-web-services`**
   - Done when installing / removing a pass updates its install state for both wallets.
9. **`feat/points`**
   - Done when scanning a pass opens the member, points changes are recorded in the history and
     the pass updates on the device.
10. **`feat/marketing-notifications`**
    - Done when a message reaches Apple and Google passes, and the 24 h rule and monthly cap are
      enforced by the database.
11. **`feat/account`**
    - Supabase forbids deleting storage objects in SQL: remove the user's files through the
      Storage API before deleting the user.
    - Done when a merchant can delete the account (sessions revoked, data cascaded) and the
      README explains how to self-host.
