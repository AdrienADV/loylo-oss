# Loylo OSS

Open-source digital loyalty cards for Apple Wallet and Google Wallet. Merchants design a card,
customers add it to their phone's wallet, and the card shows their points.

Built with [TanStack Start](https://tanstack.com/start) on Cloudflare Workers and
[Supabase](https://supabase.com) (Postgres, Auth, Storage), with the shadcn design system.

> **Status: work in progress.** The MVP is built in 11 pull requests; PRs 1–10 are merged.
> [`docs/PLAN.md`](docs/PLAN.md) has the full plan, the decisions taken so far and what comes
> next. A self-hosting guide comes with PR 11.

## What works today

- **Merchant accounts**: sign up with email confirmation, sign in, password reset.
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

Coming next: account management and the landing page (PR 11).

Each wallet is optional: without its configuration, its button does not show.

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

Confirmation and password reset emails land in Mailpit: http://127.0.0.1:54324.

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

- `src/features/` — one folder per feature (`auth`, `programs`, `members`, `enrollment`,
  `wallet-services`, `wallet-sync`, `notifications`): Zod schemas, server functions, server-only use cases,
  components.
- `src/lib/wallet/` — Apple (pass builder, signing, APNs) and Google (API client, objects,
  callback verification) adapters.
- `src/routes/` — pages and server routes (file-based routing).
- `supabase/migrations/` — the database schema, with Row Level Security on every table.

The [code map in the plan](docs/PLAN.md#code-map) has more detail.

## Contributing

Code, comments, commits and pull requests are in English; commits follow
[Conventional Commits](https://www.conventionalcommits.org). See [`AGENTS.md`](AGENTS.md) for the
conventions and [`docs/PLAN.md`](docs/PLAN.md) for how each change is verified.
