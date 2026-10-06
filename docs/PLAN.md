# Loylo OSS — MVP plan

Status: **draft, decisions recorded, to be validated** before implementation.

Loylo OSS is a web-only, open-source rewrite of Loylo (`loylo-api` AdonisJS backend +
`loylo-app` Ionic/Capacitor app), built on **TanStack Start** (deployed on **Cloudflare Workers**)
and **Supabase**. It starts from scratch: no data migration, the old repos are a functional
reference only.

## Decisions

| Topic | Decision |
| --- | --- |
| Hosting | Cloudflare Workers |
| Wallets | Apple Wallet and Google Wallet from the start |
| Card types | Loyalty points only ("event" type dropped) |
| Monetization | None (RevenueCat paywall dropped) |
| UI language | English only |
| Marketing limits | 1 message / 24 h per program, monthly cap from an env var |
| Data | Fresh start, no import from Loylo |
| Logo background removal | Dropped (assumed, not explicitly confirmed) |

## MVP scope

1. Merchant sign up / sign in with email + password (plus password reset).
2. Loyalty program creation: name, color, logo, initial points.
3. Pass issuance, self-service (public enrollment link / QR code) and manual (merchant side).
4. Points: scan a pass, add / redeem points, history.
5. Marketing notifications pushed to every wallet holding the program's pass.

## Lessons from the original code

These drive the design principles below.

1. **Schema not versioned.** No migrations, no generated types (`any` everywhere), RLS only
   visible in the dashboard. → Everything in `supabase/migrations`, types generated and checked in CI.
2. **Two backends, split authorization.** The app queries tables directly *and* calls the API;
   the API skips ownership checks (`cards/*/update`, `cards/generate`). → One entry point
   (server functions), RLS as the authorization boundary, the user-scoped client by default.
3. **Storage used as a database.** Pass `pass.json` templates live in a bucket and are mutated
   (marketing message). → Passes are a pure function of DB rows: `buildApplePass(program, member, pass)`.
4. **Wallet branching leaks everywhere.** The UI picks `cards/apple/update` vs `cards/google/update`.
   → One domain operation (`adjustPoints`), wallets behind a `WalletProvider` interface.
5. **Side effects mixed with writes, errors swallowed.** Partial states (customer created but no
   pass), un-awaited `Promise.all`, Google updated before the DB on one path and after on the other,
   raw DB errors returned to the client. → DB transaction first (RPC), then idempotent wallet sync;
   one error type and shape; never return internal errors.
6. **Business rules duplicated or client-side.** Quota checked in the UI with a hardcoded `5`,
   race-prone counters. → Rules enforced in SQL functions; the UI only displays their result.
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
12. **`is_activated` flag** flipped by any single device unregistering. → Derived from registrations / callbacks.
13. **Overly strict validation.** Names of at least 3 characters ("Li" rejected), forced
    capitalization ("McDonald" → "Mcdonald"). → Permissive names, strict on what matters.
14. **No tests.** → pgTAP for RLS and SQL functions, Vitest for pure logic, Playwright for the main flow.

## Design principles

- **Layers** (inside feature folders under `src/features/<feature>/`):
  `routes` (UI) → `*.functions.ts` (thin: middleware, Zod validation, call a use case) →
  `*.server.ts` use cases → `db` (typed Supabase queries / RPCs) and `wallet` adapters.
  Pure builders (pass JSON, Google objects, quota math, signature verification) have no I/O.
- **Schemas shared** between the form and the server function (`*.schemas.ts`).
- **The database owns invariants**: constraints, enums, checks, SQL functions for multi-row writes.
- **Writes are transactional, side effects are retryable**: the RPC commits, then the wallet sync runs.
  It is idempotent, so a failure can be retried without touching the data.
- **Least privilege**: the secret key is only used by public endpoints that have no user
  (enrollment, Apple / Google web services), in `*.server.ts` files.
- **Vertical slices**: each PR ships migration + server + UI + tests for one feature.

## Platform constraints (Cloudflare Workers)

| Need | Plan |
| --- | --- |
| Image resize / icons | Browser canvas before upload (`icon.png`, `icon@2x.png`, `logo.png`). |
| Pass signing (PKCS#7) | `passkit-generator` (`node-forge`, pure JS) with certs from env. **Spike.** |
| Google Wallet auth + save JWT | `jose` (WebCrypto). |
| Google callback verification | WebCrypto ECDSA P-256. |
| APNs push (HTTP/2 required) | **Spike**: Workers `fetch` likely cannot speak HTTP/2 to APNs. Fallback: a Supabase Edge Function (Deno) called by the app. |
| Marketing fan-out | Batch pushes; Cloudflare Queues if a program's device count exceeds per-request subrequest limits. |
| Env vars | Read per request (or `cloudflare:workers` `env`), validated once per request. |

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
  `logo_path text`, `initial_points int check (>= 0)`, `google_class_id text unique`,
  `wallet_message text check (char_length <= 100)`, `created_at`, `updated_at`.
- **`members`**: `id uuid`, `program_id → programs on delete cascade`, `email citext`,
  `first_name text`, `last_name text`, `points int not null check (points >= 0)`,
  `created_at`, `updated_at`; `unique (program_id, email)`.
- **`wallet_passes`**: `id uuid`, `member_id → members on delete cascade`,
  `provider wallet_provider ('apple' | 'google')`, `serial_number text unique` (random, QR content),
  `authentication_token text` (Apple, ≥ 32 random bytes), `google_object_id text unique`,
  `installed_at timestamptz`, `uninstalled_at timestamptz`, `created_at`, `updated_at`
  (drives Apple `passesUpdatedSince` / `Last-Modified`).
- **`point_transactions`** (append-only, no update / delete policy): `id bigint identity`,
  `member_id`, `delta int check (delta <> 0)`, `balance_after int`, `created_by uuid`, `created_at`.
- **`apple_devices`**: `id`, `device_library_identifier text unique`, `push_token text`.
- **`apple_registrations`**: `device_id`, `pass_id`, `pk (device_id, pass_id)`.
- **`notifications`**: `id`, `program_id`, `message text check (char_length between 1 and 100)`,
  `sent_by`, `created_at`, `delivered_count int`, `failed_count int`.

SQL functions (`security invoker`, so RLS still applies):

- `adjust_points(member_id, delta)`: one `update members set points = points + delta ... returning`
  (the check constraint rejects negative balances), inserts the ledger row, bumps the passes'
  `updated_at`, returns the new balance.
- `create_notification(program_id, message, monthly_cap)`: locks the program row, checks the
  24 h rule and the monthly cap, inserts, sets `programs.wallet_message`. No double send.

Also: `updated_at` triggers, indexes on every FK, `members (program_id, created_at)` for
pagination, `pg_trgm` index for name/email search if needed. RLS: merchants (`to authenticated`)
reach rows whose program has `owner_id = (select auth.uid())`; `apple_*` tables have RLS on and
no policies (server-only). Types via `supabase gen types`.

**Storage**: public bucket `program-assets`, path `{owner_id}/{program_id}/{file}`, write policies
limited to the owner's folder, size and MIME limits on the bucket.

## Pages (file routes)

Public: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/confirm`
(server route), `/join/$programId` (enrollment → Add to Apple Wallet / Save to Google Wallet).

Merchant (`_authed` layout, `beforeLoad` guard for UX, auth enforced server-side):
`/dashboard`, `/programs/new`, `/programs/$programId` (members list),
`/programs/$programId/members/new` (manual issue), `/programs/$programId/members/$memberId`
(balance, add / redeem, history), `/programs/$programId/scan`, `/programs/$programId/share`,
`/programs/$programId/notifications`, `/programs/$programId/settings`, `/account`.

## Server functions and routes

- `auth`: `signUp`, `signIn`, `signOut`, `requestPasswordReset`, `updatePassword`, `getCurrentUser`.
- `programs`: `listPrograms`, `getProgram`, `createProgram`, `updateProgram`, `deleteProgram`.
- `members`: `listMembers`, `getMember`, `findMemberBySerial`, `issuePass`, `adjustPoints`, `listTransactions`.
- `notifications`: `getNotificationQuota`, `sendNotification`, `listNotifications`.
- `account`: `deleteAccount`.
- `enrollment` (public): `getPublicProgram`, `enroll`.

Server routes: Apple PassKit Web Service under `/api/apple/v1/...` (register, unregister,
list updated serials, latest pass, log), `.pkpass` download `/api/apple/passes/$serialNumber`,
Google callback `/api/google/callback`.

## Configuration

`SUPABASE_SECRET_KEY`, `APP_URL`, `APPLE_TEAM_ID`, `APPLE_PASS_TYPE_ID`, `APPLE_WWDR_CERT`,
`APPLE_SIGNER_CERT`, `APPLE_SIGNER_KEY`, `APPLE_SIGNER_KEY_PASSPHRASE`, `APNS_KEY_ID`, `APNS_KEY`,
`GOOGLE_ISSUER_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `NOTIFICATIONS_MONTHLY_CAP`.

## Milestones

0. **Spikes** (throwaway): sign a `.pkpass` on Workers; APNs push from Workers vs Edge Function;
   Google save JWT with `jose`. Outcome decides the wallet adapters.
1. **Foundations**: CI (Biome, `tsc`, Vitest, `supabase db lint`, types drift check), env config,
   schema + RLS + pgTAP tests, auth pages, `authMiddleware`, `_authed` layout.
2. **Programs**: CRUD, browser image processing, pass preview, Google class creation.
3. **Passes**: enrollment page, manual issue, Apple signing + download + web service, Google save
   link + callback.
4. **Points**: members list, scan, `adjust_points`, history, wallet sync.
5. **Marketing notifications**: `create_notification`, Apple `changeMessage` + push, Google `addMessage`.
6. **Polish**: account deletion, landing page, Playwright happy path, self-hosting docs.
