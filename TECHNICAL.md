# Fairline: Technical Documentation

Consumer margin-transparency tool for the TxODDS World Cup Hackathon (Consumer and Fan Experiences track). Solo build.

## What it does
Reads a punter's slip from a screenshot, detects distinct bets within it (Bet Builders vs standalone singles), prices every leg against TxLINE StablePrice, and shows margin, expected value and worst leg on a fully reactive verdict. Hands any leg to FairPlay (companion app) as a fair-price P2P challenge.

## Stack
- Next.js 15 (App Router), React 19, TypeScript. Vercel.
- Upstash Redis (shared with FairPlay) for the accumulated market book.
- TxLINE devnet subscription (service level 1, on-chain activation tx `574VwkR5...T9vW`).
- Claude vision (claude-sonnet-4-6) for slip OCR, structuring and bet grouping.

## Architecture
```
/                       landing
/xray                   scanner, live board, reactive X-ray, FairPlay handoff
/x?d=...                shareable verdict card (whole X-ray encoded in the link)
/api/parse-slip         vision -> grouped bets -> live-market matching
/api/market-board       accumulated book per fixture (+ historical showcase)
/api/live-slip          starter legs from upcoming fixtures
/api/post-to-fairplay   server relay of signed challenges onto FairPlay's book
/api/txline/[...path]   credentialed proxy
lib/: engine (margins/EV), markets DSL, txline-server (fixtures, Redis book),
      phantom (sign/anchor), bet-codec, xray-codec, flags
```

## Data layer
- **Market book (Redis, shared with FairPlay).** Devnet odds snapshots return a rolling window of recent messages, not the full book, so every line seen is accumulated into `fairplay:markets:{fixtureId}` (dedupe by market+line, latest publish wins). The book survives deploys and cold starts.
- **Fixture discovery is competition-agnostic.** Unfiltered fixtures snapshot first (everything the free tier covers: World Cup, International Friendlies, EPL), falling back to `TXLINE_COMPETITION_IDS`. Strictly-future filter for live fixtures.
- **Historical showcase.** The World Cup final's fair book, captured before kick-off, is served from Redis as a labelled showcase fixture and remains matchable by the scanner. Finished-match legs are analysis-only: X-ray works, posting is disabled.

## Slip pipeline
1. Vision prompt returns grouped bets; hard rule: N selections = N legs, merging forbidden; builder legs carry no price.
2. Deterministic server splitter: any leg with its own read price inside a multi-leg group is a standalone single (builders never print leg odds).
3. Legs matched to live+showcase markets with team-order flipping; kickoff time attached for downstream KO cutoffs.
4. Client renders bet-group chips; each bet loads and X-rays independently.

## Honest maths (the important invariants)
- Fair prices come solely from StablePrice (implied probabilities sum to 100; verified empirically).
- A printed combo price is only locked/apportioned when EVERY leg has a verified fair price. Otherwise legs seed at fair on AUTO with an explanation; nothing incomparable is ever presented as margin.
- Unpriced markets are declined and shown EXCLUDED; per-leg margins render only where a real bookie price exists (scanned, derived from a fully-comparable combo, or typed).
- Sign-correct display: positive margin (skim) in accent, negative (price beats fair) in green with flipped copy.
- Engine: p = 1/price; leg margin = p(bookie)/p(fair) - 1; acca fair = product of fair legs; EV = stake x (price x fairProb - 1). Reactive: every figure recomputes on edit.

## Sharing
The verdict encodes into `/x?d=...` (base64url payload: legs, prices, stake). Recipient renders the full X-ray client-side with excluded legs and a run-your-own CTA, plus Post-to-X and copy-link.

## Environment
`TXLINE_API_ORIGIN`, `TXLINE_JWT`, `TXLINE_API_TOKEN`, `ANTHROPIC_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `NEXT_PUBLIC_FAIRPLAY_URL`, optional `TXLINE_COMPETITION_IDS`.

## Known limits
- Same-game combined fair pricing (correlation-aware builders) is roadmap; today combos of correlated legs are labelled "legs multiplied" on FairPlay and never asserted as joint-fair here.
- Guest JWT expires periodically; reactivation via `scripts/activate.mjs`.
