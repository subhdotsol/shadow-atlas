# How to play Shadow Atlas

Shadow Atlas is a two-player strategy game on a world map. Two generals, **Ember** (orange) and **Tide** (blue), fight over 8 territories. Both of you give your order **at the same time**, and neither can see the other's order until both are locked in. You're betting on what your opponent will do.

The game runs on Solana devnet. Orders stay hidden inside a MagicBlock private rollup until both players have committed, so nobody (not your opponent, not a block explorer) can peek.

---

## In one minute

1. **Get in a match.** One player presses **Create match** and shares the 6-letter room code. The other types the code and presses **Join**. Either player presses **Start game**.
2. **Know which side you are.** The slim bar above the map says *"You are Ember"* (orange) or *"You are Tide"* (blue). Your tiles carry a small **person badge**. The number on every tile is how many **troops** are there.
3. **Each turn, give one order.** Click one of your territories (only yours can be selected), then click a neighbour:
   - an enemy tile marked **Attack** to attack it, or
   - one of your tiles marked **Move here** to send it troops.
4. **Choose how many troops** in the order card that opens next to the target (− / +) and press **Commit attack** or **Commit transfer**. Your order is now sealed. You'll see your troops travelling along the arrow.
5. **When both have committed**, both orders happen at once. The map shows both armies moving and a short result card sums it up, then closes by itself: no button to press, just give your next order. The bar above the map tells you live whether your opponent has committed yet.
6. **First to hold 5 of the 8 territories wins.**

Tips: the **⤢** button in the bar plays full screen, **Esc** steps back while you're choosing a move, and the **?** button in the bottom-right corner shows the rules.

---

## The map

| # | Territory | Borders |
|---|---|---|
| 0 | North America | Europe, South America |
| 1 | Europe | North America, Middle East, North Africa |
| 2 | Middle East | Europe, North Africa, India |
| 3 | East Asia | India, South Africa |
| 4 | South America | North America, North Africa |
| 5 | North Africa | Europe, Middle East, South America, South Africa |
| 6 | South Africa | North Africa, East Asia |
| 7 | India | Middle East, East Asia |

On the board, borders are the **dotted lines**. Troops can only travel along a dotted line, one border per turn.

> **Why can't North America attack India?** They don't share a border. North America only touches Europe and South America. To reach India you have to capture the territories in between, one turn at a time (for example North America → Europe → Middle East → India).

When you select a territory, everything it can reach is labelled on the map (**Attack** or **Move here**), and everything it can't reach fades out. If you click an enemy territory that's out of reach, the panel says which territories it borders.

### Starting position

Each player starts with 4 territories and 10 troops:

- **Ember:** North America 3, South America 2, North Africa 2, South Africa 3
- **Tide:** Europe 4, Middle East 2, East Asia 3, India 1

---

## Orders

You give **exactly one order per turn**, from a territory you hold.

| Order | From | To | What happens |
|---|---|---|---|
| **Attack** | your territory | a bordering enemy territory | Your troops fight the defenders (see below). |
| **Reinforce** (move) | your territory | a bordering territory of yours | Troops are moved across. Moves land *before* any attack, so moving into a territory defends it this turn. |

- You choose how many troops to send. **At least 1 always stays behind**, so a territory with 1 troop can't give orders.
- Clicking a target on the map picks it for you. The **Attack** and **Reinforce** buttons in the side panel do the same thing, if you prefer lists.

## How fights work

- An attack **captures** a territory only with **more** troops than are defending it. The survivors (attackers minus defenders) move in.
  *Example: 4 attack 3, so you capture it with 1 troop.*
- If the attack isn't bigger, the defenders lose that many troops but **always keep at least 1** and keep the territory. **A tie goes to the defender.**
  *Example: 3 attack 3, so the defender holds with 1.*
- If both players attack the **same** territory, or attack **each other head-on**, the two armies clash first. The bigger one carries on with the difference; equal armies wipe each other out.

The order in which things happen each turn:

1. Moves (reinforcements) land.
2. Attacks leave their territories.
3. Armies that meet clash.
4. Surviving attacks hit their targets.
5. **New troops:** every territory you hold gains **+1 troop** (up to 30 per territory).

## Hidden, simultaneous turns

- When you commit, your opponent only sees **"Committed"**, never your order.
- When both orders are in, the turn resolves and both are revealed in the result table: who did what, and what happened.
- Because you can't see their order, every turn is a guess: attack their weak spot, or defend where you think they'll strike?

## Time limit

Each turn has a **30-second clock**, shown in the bar above the map (it turns red for the last 10 seconds).

- Commit before it runs out and your order counts.
- If it runs out first, the turn **resolves anyway** and anyone who hasn't committed **holds**: no attack, no move, but their territories still get the new troop.
- If both commit early, the turn resolves right away; nobody waits for the clock.

No button to press: the game resolves the turn by itself, so a slow or absent player never holds the game up. (As a last-resort backstop, if no one's page is open to resolve a turn for 2 minutes, a player who committed can claim the win.)

---

## How you win

- **Hold 5 of the 8 territories** at the end of a turn, or
- **Eliminate** your opponent (they hold nothing).

If nobody has won after **20 turns**: more territories wins. If that's tied, more total troops wins. If that's tied too, it's a draw.

## What the winner gets

There's no wager and no prize money: neither player stakes anything, and the contract doesn't pay out SOL or tokens.

What winning gives you:

- **A permanent, verifiable result on Solana.** When the match ends, the final board and the winner's wallet are written to the match account on Solana (devnet), and anyone can check it on an explorer.
- **Your record in the app.** The match shows as **Victory** (or **Defeat**) under *Your matches*, with the final score, the turns played and a replay of the final turn.

The only costs are tiny devnet network fees, paid from your **player key** (a small in-browser wallet the app creates for you). You can withdraw whatever SOL is left on it at any time.

---

## Getting set up

1. Open the app and look at the **player key** row on the home page. This key signs every game move, so your main wallet isn't asked to approve each turn.
2. Fund it with a little **devnet** SOL (about 0.02 SOL is enough to create or join a match):
   - **Connect wallet → Top up**, using a wallet set to Devnet (in Phantom: Settings → Developer Settings → Testnet Mode → Solana Devnet), or
   - **Get devnet SOL** from the public faucet, or
   - ask the other player to **Send** you 0.05 SOL from their player key (*Add or send SOL → Send*).
3. **Create match** or **Join** with a room code, and play.

This is a devnet game: nothing in it is real money.
