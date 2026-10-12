import { WalletError } from "@solana/wallet-adapter-base";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, SystemProgram, Transaction, type Keypair, type PublicKey } from "@solana/web3.js";
import { baseConnection } from "./program";
import { waitForSignature } from "./confirm";
import { debugError, debugLog } from "./debug-log";

/** Lamports the player key needs to create or join a match (rent + fees), with headroom. */
export const MIN_PLAY_LAMPORTS = 0.02 * LAMPORTS_PER_SOL;
export const TOP_UP_LAMPORTS = 0.1 * LAMPORTS_PER_SOL;
const FEE_LAMPORTS = 5_000;

export const FAUCET_URL = "https://faucet.solana.com";
export const WALLET_DEVNET_HELP =
  "Switch your wallet to Devnet (Phantom: Settings → Developer Settings → Testnet Mode → Solana Devnet), then try again. Or use Get devnet SOL, which needs no wallet.";

export const sol = (lamports: number) => (lamports / LAMPORTS_PER_SOL).toFixed(lamports < LAMPORTS_PER_SOL ? 3 : 2);

/** Error with copy that is already safe to show as-is. */
export class FundingError extends Error {}

const isRejection = (e: unknown) => {
  const err = e as { code?: number; message?: string; error?: { message?: string } } | null;
  if (err?.code === 4001) return true;
  const text = `${err?.message ?? ""} ${err?.error?.message ?? ""}`;
  return (e instanceof WalletError || err?.message !== undefined) && /reject|denied|cancel/i.test(text);
};

const DEVNET_CHAIN = "solana:devnet";

type StandardSignTransaction = {
  signTransaction: (
    ...inputs: { account: unknown; transaction: Uint8Array; chain: string }[]
  ) => Promise<readonly { signedTransaction: Uint8Array }[]>;
};
type StandardWalletLike = {
  accounts: readonly { address: string; features: readonly string[] }[];
  features: Record<string, unknown>;
};

/**
 * Sign through the wallet's Wallet Standard feature with `chain: "solana:devnet"`.
 *
 * The wallet adapter's own `signTransaction` leaves the chain out, so a wallet like Phantom
 * treats the transaction as belonging to whatever network its UI is set to (mainnet by
 * default) and fails with "Unexpected error". Naming the chain makes it a devnet request.
 * Returns null when the wallet isn't a Wallet Standard wallet with sign-only support.
 */
async function signOnDevnet(adapter: unknown, from: PublicKey, tx: Transaction): Promise<Transaction | null> {
  const standard = (adapter as { wallet?: StandardWalletLike } | null)?.wallet;
  const feature = standard?.features?.["solana:signTransaction"] as StandardSignTransaction | undefined;
  const account = standard?.accounts?.find((a) => a.address === from.toBase58());
  debugLog("wallet", "top-up: wallet capabilities", {
    walletChains: (standard as { chains?: readonly string[] } | undefined)?.chains ?? null,
    walletFeatures: standard ? Object.keys(standard.features ?? {}) : null,
    account: account ? { address: account.address, features: account.features, chains: (account as { chains?: readonly string[] }).chains } : null,
  });
  if (!feature || !account || !account.features.includes("solana:signTransaction")) return null;
  const [output] = await feature.signTransaction({
    account,
    chain: DEVNET_CHAIN,
    transaction: new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false })),
  });
  return Transaction.from(output.signedTransaction);
}

/** The wallet's own error text (adapters wrap it), for the message and the log. */
function walletReason(e: unknown) {
  const err = e as { message?: string; error?: { message?: string } } | null;
  return err?.error?.message || err?.message || String(e);
}


/**
 * Browser wallet → player key: a plain SOL transfer on Solana devnet, with exactly one
 * wallet prompt.
 *
 * - The wallet only *signs*; the app broadcasts to devnet. Asking the wallet to send makes it
 *   use its own RPC, which is mainnet unless the wallet is switched to devnet.
 * - Once the wallet has signed, it is never asked again: a devnet failure is reported.
 *   Only a wallet that can't sign on its own (no sign-only support) is asked to send instead.
 */
export async function topUp(
  wallet: Pick<WalletContextState, "publicKey" | "sendTransaction" | "signTransaction" | "wallet">,
  to: PublicKey,
) {
  const from = wallet.publicKey;
  if (!from) throw new FundingError("Connect a wallet first.");
  const connection = baseConnection();

  const balance = await connection.getBalance(from, "confirmed");
  if (balance < TOP_UP_LAMPORTS + FEE_LAMPORTS) {
    throw new FundingError(
      `Your wallet has ${sol(balance)} devnet SOL, not enough for a ${sol(TOP_UP_LAMPORTS)} top-up. Use Get devnet SOL instead, or fund the wallet on devnet first.`,
    );
  }

  const blockhash = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: from, ...blockhash }).add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: TOP_UP_LAMPORTS }),
  );

  debugLog("wallet", "top-up: transaction built", {
    wallet: wallet.wallet?.adapter.name,
    from: from.toBase58(),
    to: to.toBase58(),
    lamports: TOP_UP_LAMPORTS,
    walletDevnetBalance: balance,
    blockhash: blockhash.blockhash,
    rpc: connection.rpcEndpoint,
  });
  let signature: string;
  if (wallet.signTransaction) {
    let signed: Transaction;
    try {
      debugLog("wallet", `top-up: asking the wallet to sign for ${DEVNET_CHAIN} (1 request)`);
      signed = (await signOnDevnet(wallet.wallet?.adapter, from, tx)) ?? (await wallet.signTransaction(tx));
      debugLog("wallet", "top-up: wallet signed", { signatures: signed.signatures.length, instructions: signed.instructions.length });
    } catch (e) {
      if (isRejection(e)) throw e;
      const reason = walletReason(e);
      debugError("wallet", "top-up: the wallet refused to sign", e);
      throw new FundingError(`Your wallet couldn't sign the top-up (it said: "${reason}"). ${WALLET_DEVNET_HELP}`);
    }
    try {
      signature = await connection.sendRawTransaction(signed.serialize(), { preflightCommitment: "confirmed" });
    } catch (e) {
      debugError("wallet", "top-up: devnet rejected the signed transaction", e);
      // Typically the wallet added its own mainnet-only checks while signing. Nothing was sent.
      throw new FundingError(`Devnet rejected the transaction your wallet signed. Nothing was sent. ${WALLET_DEVNET_HELP}`);
    }
  } else {
    try {
      debugLog("wallet", "top-up: asking the wallet to sign and send (1 request)");
      signature = await wallet.sendTransaction(tx, connection);
    } catch (e) {
      debugError("wallet", "top-up: sign-and-send failed", e);
      if (isRejection(e)) throw e;
      throw new FundingError(`Your wallet couldn't send a devnet transaction. ${WALLET_DEVNET_HELP}`);
    }
  }
  debugLog("wallet", "top-up: sent, confirming", { signature });
  const res = await waitForSignature(connection, signature, blockhash.lastValidBlockHeight);
  if (res.err) {
    debugLog("wallet", "top-up: failed on devnet", { signature, err: res.err }, "error");
    throw new FundingError("The top-up transaction failed on devnet.");
  }
  debugLog("wallet", "top-up: confirmed", { signature });
  return signature;
}

/** Player key → browser wallet: everything except the fee. */
export async function withdraw(keypair: Keypair, to: PublicKey) {
  const connection = baseConnection();
  const balance = await connection.getBalance(keypair.publicKey, "confirmed");
  const lamports = balance - FEE_LAMPORTS;
  if (lamports <= 0) throw new FundingError("Nothing to withdraw.");
  const blockhash = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: keypair.publicKey, ...blockhash }).add(
    SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: to, lamports }),
  );
  tx.sign(keypair);
  const signature = await connection.sendRawTransaction(tx.serialize());
  const res = await waitForSignature(connection, signature, blockhash.lastValidBlockHeight);
  if (res.err) throw new FundingError("Withdraw failed.");
  return signature;
}

/** What one player key sends another with "Send to a player": enough to join and play. */
export const SEND_TO_PLAYER_LAMPORTS = 0.05 * LAMPORTS_PER_SOL;

/**
 * Player key → another player key (e.g. Ember funding Tide). Signed by the player key in
 * the browser, so no wallet extension is involved. Keeps enough behind to stay playable.
 */
export async function sendToPlayer(keypair: Keypair, to: PublicKey, lamports = SEND_TO_PLAYER_LAMPORTS) {
  if (to.equals(keypair.publicKey)) throw new FundingError("That's this player key. Paste the other player's key.");
  const connection = baseConnection();
  const balance = await connection.getBalance(keypair.publicKey, "confirmed");
  if (balance < lamports + MIN_PLAY_LAMPORTS + FEE_LAMPORTS) {
    throw new FundingError(
      `This player key has ${sol(balance)} SOL. Sending ${sol(lamports)} needs at least ${sol(lamports + MIN_PLAY_LAMPORTS + FEE_LAMPORTS)}, so it can still play.`,
    );
  }
  const blockhash = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: keypair.publicKey, ...blockhash }).add(
    SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: to, lamports }),
  );
  tx.sign(keypair);
  const signature = await connection.sendRawTransaction(tx.serialize());
  const res = await waitForSignature(connection, signature, blockhash.lastValidBlockHeight);
  if (res.err) throw new FundingError("Sending failed on devnet.");
  return signature;
}
