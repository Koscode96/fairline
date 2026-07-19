# Fairline: Technical Documentation

Consumer margin-transparency tool for the TxODDS World Cup Hackathon (Consumer & Fan Experiences track). Solo build.

## What it does
Reads a punter's accumulator (via screenshot or built from a live market board), prices every leg against TxLINE StablePrice, and shows the hidden bookmaker margin, expected value, and a verifiable timestamp behind each fair price. Hands off to FairPlay (companion app) to take any leg peer-to-peer at the fair price.

## Stack
- Next.js 15 (App Router), React 19, TypeScript. Deployed on Vercel.
- TxLINE devnet subscription (service level 1, on-chain activation tx `574VwkR5HqLJoQNLo4Zk3WuGt1UZwpYXLk9NwdCKtiWKYSpsArWUkZojDPMSxGKCbnxRAX3uzSAxWFTFZKRuT9vW`).
- Claude vision (claude-sonnet-4-6) for bet-slip OCR and structuring.
- No database. Fairline is stateless; challenge state lives on FairPlay.

## Architecture
```
Browser (React client)
  |- /api/txline/[...path]   server proxy; attaches JWT + X-Api-Token from env
  |- /api/live-slip          builds starter slip from upcoming fixtures + live odds
  |- /api/market-board       full accumulated market book per fixture
  |- /api/parse-slip         Claude vision -> structured legs -> matched to live markets
  |- /api/post-to-fairplay   relays a signed challenge onto the FairPlay order book
lib/
  engine.ts        de-margin and EV maths (pure functions, unit tested)
  markets.ts       market DSL: human bets -> stat predicates; settlement rules
  txline-server.ts TxLINE client, fixture filter (strictly future), market accumulation
  phantom.ts       wallet connect, message signing, Solana memo recording
```

## TxLINE integration
- Auth: guest JWT (`POST /auth/guest/start`) plus API token from on-chain subscribe and signed activation (`${txSig}:${leagues}:${jwt}` preimage). Both sent on every call (`Authorization: Bearer`, `X-Api-Token`). Credentials are held server-side only; the browser never sees them.
- Endpoints used: `/fixtures/snapshot`, `/odds/snapshot/{fixtureId}`, `/scores/snapshot/{fixtureId}`.
- StablePrice semantics: prices arrive as integers x1000 with implied percentages summing to 100, i.e. the feed is already de-margined. Verified empirically before relying on it.
- Snapshot behaviour: each odds snapshot returns a rolling window of recent price messages, not the full book. The client accumulates markets across calls (dedupe by market+line, keep latest publish timestamp) so the visible book converges to complete.
- Fixture policy: strictly upcoming only (`startTime > now`, not finished).

## Margin engine
- Implied probability p = 1/price. Overround = sum(p) - 1.
- Leg margin = p(bookie)/p(fair) - 1.
- Acca fair price = product of fair leg prices; margin compounds multiplicatively, which is the core consumer insight (a 5% per-leg margin on a 4-fold is ~21.5%).
- EV = stake x (bookiePrice x fairProb - 1).
- Legs without a StablePrice market are declined, never estimated.

## Slip scanning
Screenshot -> base64 -> server route -> Claude vision with a strict JSON schema (teams, market enum, line, decimal odds; fractional odds converted). Output is matched against live fixtures and markets with team-order flipping. Unmatched legs are shown and excluded from the maths.

## Wallet and proofs
Phantom via `window.phantom` (no adapter dependency). Challenges are signed (ed25519 over the bet terms) and can be recorded as Solana devnet Memo transactions; the UI links to the explorer transaction.

## Environment
`TXLINE_API_ORIGIN`, `TXLINE_JWT`, `TXLINE_API_TOKEN`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_FAIRPLAY_URL`.

## Known limits
- Devnet StablePrice covers match result, goal totals and Asian handicaps (FT and H1). BTTS, corners and cards are settleable from the scores feed but not priced, so they are excluded from X-rays.
- Guest JWT expires periodically; reactivation is a one-command script (`scripts/activate.mjs`).
