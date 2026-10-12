# Shadow Atlas — web

The frontend for [Shadow Atlas](https://github.com/narsixyz/shadow-atlas-contract), a two-player strategy game on Solana where both generals move in secret. Orders stay hidden from the opponent, enforced by MagicBlock's private rollup (TEE), until both are sealed.

**New to the game?** Read [How to play](HOW-TO-PLAY.md): the rules, the map, how to win and what winning gets you.

Next.js 16 (App Router, Cache Components, React Compiler) · Tailwind 4 · Anchor 0.32 · `@solana/wallet-adapter` · `@magicblock-labs/ephemeral-rollups-sdk` · Bun.

## Run it

```sh
bun install
bun dev            # http://localhost:3000
```

Use two browsers (or two browser profiles). Each one gets its own **player key**, and about 0.02 devnet SOL covers creating or joining a match. Fund it from the key icon in the header:

- **Get devnet SOL** copies the player address and opens [faucet.solana.com](https://faucet.solana.com). Works without any wallet.
- **Send to a player** (under *Add or send SOL*): a funded player key sends 0.05 SOL to another player key, signed in the browser, with no wallet extension involved. The easiest way to fund the second player: they copy their player key, the first player pastes it and presses Send. Shown once the key holds at least 0.07 SOL, so the sender can still play.
- **Top up from wallet** sends 0.1 SOL from your browser wallet's **devnet** balance. The wallet only signs; the app sends the transaction to devnet itself, so it works even when the wallet's own network is set to mainnet. Wallets that can't sign without sending fall back to the wallet's send, which needs the wallet on devnet (Phantom: Settings → Developer Settings → Testnet Mode → Solana Devnet). The panel shows your wallet's devnet balance, and top-up stays disabled when it's too low.

## Player key vs. wallet

Browser wallet extensions (Phantom, Solflare, …) check every transaction against their own Solana RPC, so they refuse to sign transactions bound for MagicBlock's private rollup. That rollup's blockhash and delegated accounts only exist there, and the wallet throws a generic `WalletSignTransactionError: Unexpected error`. MagicBlock's own browser examples solve this the same way this app does:

- A **player key** (a keypair in `localStorage`) signs every game transaction and the rollup login. Play needs no wallet prompts.
- Your **wallet** only funds the player key (a plain SOL transfer on Solana) and receives withdrawals.

Keep only game money on the player key. Clearing site data deletes it, and with it access to unfinished matches, so withdraw first.

## Scripts

| Command | What it does |
|---|---|
| `bun dev` | Dev server |
| `bun run build` | `idl:check --offline`, then the production build. A stale IDL fails the build. |
| `bun idl:sync` | Copy `target/idl/shadow_atlas.json` and `target/types/shadow_atlas.ts` from the contract repo into `src/idl/` |
| `bun idl:check` | Fail if `src/idl/` differs from the contract build (lists added or removed instructions), or if no program is deployed at the IDL address on devnet. `--offline` skips the chain check. |
| `bun test` | Rules-mirror and room-code unit tests (`src/lib/game.test.ts`) |
| `bun smoke` | Plays a full match on devnet through `src/lib/tx.ts`, the same functions the UI buttons call, including the privacy checks. Uses your Solana CLI wallet as player A and funds a fresh player B with 0.05 devnet SOL. |
| `bun ui-e2e` | Full match in real Chrome against the running app: two isolated profiles click through create, join by typing the room code, Start game, a troop transfer each, the reveal table, Ember's 3-troop attack on the Middle East for a 5-territory Victory, and the settle; and check that Tide never sees Ember's move early. Funds both player keys with 0.04 devnet SOL from your CLI wallet. `HEADFUL=1` to watch, `APP_URL` to target another host. |
| `bun ui-audit` | Loads every page in Chrome and fails on console errors. Injects a fake wallet that refuses to sign the way Phantom does on the wrong network, and checks that a top-up shows guidance instead of an error overlay. Checks the theme too: a first visit follows the OS setting before first paint, the light/dark switch works by mouse and keyboard, the saved choice beats the OS on reload, no hydration warnings, no horizontal scroll at 375px. |
| `bun ui-screens` | Every game screen in Chrome without sending a transaction: opens `/dev/screens` (development only, fixed match states), walks the move composer (select → Attack → target → troops → summary), checks the reveal table, turn scores and Victory screen, no console errors, no horizontal scroll at 375 px. `SHOTS_DIR` saves screenshots. |
| `bun icons` | Regenerate `src/app/favicon.ico` (16/32/48) and `src/app/apple-icon.png` (180) from the vector mark in `src/app/icon.svg`, rendered with headless Chrome |
| `bun run lint` / `bun typecheck` | ESLint / TypeScript |

The contract repo defaults to `../shadow-atlas`; override with `SHADOW_ATLAS_PROGRAM_DIR`. After changing the contract: `anchor build` there, then `bun idl:sync` here.

## Configuration

All optional; the defaults target devnet.

| Variable | Default |
|---|---|
| `NEXT_PUBLIC_BASE_RPC` | `https://rpc.magicblock.app/devnet,https://api.devnet.solana.com` (comma-separated, tried in order) |
| `NEXT_PUBLIC_TEE_RPC` | `https://devnet-tee.magicblock.app` |
| `NEXT_PUBLIC_TEE_WS` | `wss://devnet-tee.magicblock.app` |

The program ID is read from the synced IDL, so it can't drift from the contract.

## Game screens (`/match/[id]`)

| Screen | When | What happens |
|---|---|---|
| **Lobby** | Match created | **Room ID** (6 characters, e.g. `K7Q2XM`) with copy and **Copy invite link**; both wallets; status ("Waiting for an opponent to join" / "Both players in. Ready to start"); a visitor gets **Join room K7Q2XM**. **Start game** unlocks once both are in; either player can press it. |
| **Your turn** | Turn open, not yet committed | Map + side panel. Select any territory: the **selected-territory panel** shows owner, troops, **Attack**, **Reinforce** and **View details** (connected territories), and the map highlights its connections. |
| **Attack / Reinforce** | After choosing an action | Destination list (or click the outlined territory on the map), a **number of troops** stepper (1 to troops − 1), an odds hint, and the summary: *Move selected · Action · Troops committed*, then **Commit move**. Reinforce moves troops to an adjacent territory you own. |
| **Move committed** | Your move is in | Lock, the same summary, and "Waiting for opponent". Becomes **Both moves committed — Revealing the turn…** once both are in. |
| **Turn result** | A turn resolved while you watched | Both armies move on the map, a **Turn N complete** card sums it up in two lines (with the new troops) and closes by itself after 6 s. You can give your next order right away. The full reveal table (*Player · Move · Result*) sits under the map. |
| **Game over** | Win, draw or timeout | Victory / Defeat / Draw, the **winner's wallet**, final territories, turns played, how it was won, the final turn's reveal table, **Play again** and **Back to lobby**. The result is saved to Solana automatically ("Saved on Solana"; Ember's client first, Tide's after 8 s if needed). |

The header bar on every screen shows ← Back, the room (copyable), the turn, and a status badge (Your turn, Waiting for opponent, Revealing moves, Victory…).

### The map

The board is a real world map: Natural Earth country shapes (public domain) from the [`world-atlas`](https://github.com/topojson/world-atlas) package, unpacked with `topojson-client` and projected with `d3-geo` (Natural Earth projection). `src/lib/world.ts` groups countries into the contract's 8 territories; countries take the colour of whoever holds their region, and land outside the 8 regions (Russia, Australia, New Zealand) is drawn as unclaimed; Antarctica is left off.

| # | Region | Start | Troops | # | Region | Start | Troops |
|---|---|---|---|---|---|---|---|
| 0 | North America | Ember | 3 | 1 | Europe | Tide | 4 |
| 4 | South America | Ember | 2 | 2 | Middle East (with Central Asia) | Tide | 2 |
| 5 | North Africa | Ember | 2 | 7 | India | Tide | 1 |
| 6 | South Africa | Ember | 3 | 3 | East Asia (with Southeast Asia) | Tide | 3 |

4 territories and 10 troops each. First to 5 territories wins.

The 10 connections are the contract's, drawn as dashed arcs. Moves are drawn as arrows with their troop count: attacks with an arrowhead, reinforcements with a dot and a `+N` badge. The tile anchor points were chosen by a small search so no tile or label overlaps another down to the smallest board (720 px wide; narrower screens scroll the map sideways). The names are presentation only; the program knows territories by index.

Transactions are confirmed by polling signature status rather than web3.js's WebSocket subscriptions, which public RPCs often refuse under load.

## How the app maps to the contract

| Screen / button | Instruction(s) | Where |
|---|---|---|
| Home → **Create match** | `create_match(code)` with a fresh random room code | Solana |
| Home → room code → **Join room** | (opens `/match/<code>`; the address is derived from the code) | — |
| Lobby → **Cancel match** (creator) | `cancel_match` | Solana |
| Lobby → **Join room <code>** | `join_match` + `delegate_match`, one tx with a 400k compute limit | Solana |
| *(automatic)* | Player key signs the TEE login challenge for an auth token | Private rollup |
| Lobby → **Start game** | `init_permissions` (plus `delegate_match` first if joining didn't delegate) | Private rollup |
| **Commit move** | `submit_secret_move`, then `announce_commit` | Private rollup |
| **Resolve now** (rare fallback) | `resolve_turn` | Private rollup |
| **Claim the win** / **End as a draw** | `claim_timeout` (after 120 s) | Private rollup |
| *(automatic, at game over)* | `settle_match` | Private rollup → Solana |

**Commit move** has the player key sign two transactions, then sends them separately. The first carries the move and touches only the player's private account. The second, sent once the rollup has moved past the first's slot, publishes "committed" with no move data. Bundling them would leak the move, and the program rejects it anyway.

**Where state is read from:** `useMatch` checks the match account on Solana. If our program owns it, the match is in the lobby or settled, and it's read there. If the delegation program owns it, the match is live on the rollup and is read through the player's authenticated TEE connection. Each player also reads their own move account, which the TEE hides from everyone else.

The player's identity in a match is their player key's address, shown in the Generals card.

**Your matches** (top of the home card) lists every match this player key created or joined, with live status (your move, waiting for rival, lobby, needs settling, result) and a link back into the room. It combines a record kept in this browser, which covers matches live on the rollup since their accounts are then owned by the delegation program, with a `getProgramAccounts` lookup on Solana for lobbies and settled matches, run at most once a minute because public RPCs rate-limit it.

**RPC load:** Solana's public `api.devnet.solana.com` rate-limits browser apps quickly (HTTP 429). The app reads and sends through MagicBlock's devnet RPC first, and any request that gets a 429, a 5xx or a network error is retried once on the next endpoint in `NEXT_PUBLIC_BASE_RPC` (web3.js's own rate-limit retry is off, so it doesn't keep hitting the endpoint that refused). While a match is on the rollup, the match screen polls the rollup and re-checks Solana only every 30 s; the balance refreshes every 15 s.

## Layout

```
src/
├── app/
│   ├── page.tsx                  home: pitch, create, join
│   ├── match/[id]/page.tsx       match route: /match/<room code> (an address also works)
│   └── dev/screens/page.tsx      development-only screen preview (404 in production)
├── components/
│   ├── match-view.tsx            every match phase: lobby, setup, orders, timeout, result
│   ├── world-map.tsx             8-territory map; territories are real <button>s over an SVG
│   ├── player-key.tsx            the browser player key that signs game transactions
│   ├── player-panel.tsx          player key balance, top up / withdraw
│   ├── tee-session.tsx           TEE auth token per player key (sessionStorage)
│   ├── providers.tsx             wallet adapter (funding only) + player key + TEE session
│   └── home-actions.tsx · site-header.tsx · ui.tsx
├── hooks/use-match.ts            locate + poll the match (Solana vs rollup)
├── lib/
│   ├── tx.ts                     one function per contract action + error decoding
│   ├── program.ts                Anchor client, PDAs, decoders
│   ├── funding.ts                top up, withdraw
│   ├── game.ts                   client mirror of the rules (UI guidance only)
│   └── config.ts                 endpoints, validator, constants
└── idl/                          synced from the contract — don't edit by hand
scripts/idl.ts · scripts/smoke.ts · scripts/ui-e2e.ts · scripts/ui-audit.ts · scripts/ui-screens.ts
brand.md                          palette, type and voice
```

## Notes

- **Themes:** Light and Dark, from the switch in the header. On a first visit the page follows the OS setting; once the switch is flipped, that choice is saved (localStorage `shadow-atlas:theme`) and used on every load. `src/lib/theme.ts` holds an inline `<head>` script that sets `data-theme` on `<html>` before first paint, so there is no flash; `<html>` uses `suppressHydrationWarning` for that reason. Dark tokens live under `:root[data-theme="dark"]` in `globals.css`.
- `WalletProvider` has an `onError` handler. Without one, the adapter `console.error`s every wallet failure, which Next.js shows as an error overlay; the app already surfaces these errors in its own UI.
- `@coral-xyz/anchor` is listed in `serverExternalPackages`: its ESM build references CommonJS `exports`, which breaks Turbopack's server rendering.
- **Room codes:** `/match/<code>` derives the match address from the code alone (`["match", code]`). Codes use A–Z and 2–9 without I, O, 0 and 1, and typing is forgiving (lowercase, spaces and dashes are fine). Matches created before room codes use an older account layout and show a clear "can't be opened" message.
- The game constants in `src/lib/config.ts` (turn timeout, max turns, win threshold) mirror `programs/shadow-atlas/src/constants.rs`. The program is the authority; the client copy only drives the UI.
