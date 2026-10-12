import type { Connection, TransactionSignature } from "@solana/web3.js";

export class ConfirmTimeoutError extends Error {
  constructor() {
    super("The network didn't confirm in time. Try again.");
  }
}

/**
 * Wait for a signature by polling its status. web3.js's confirmTransaction opens a WebSocket
 * per connection, which public RPCs often refuse under load (HTTP 429 on the handshake);
 * plain status polls are cheaper and don't need a socket.
 */
export async function waitForSignature(
  connection: Connection,
  signature: TransactionSignature,
  lastValidBlockHeight: number,
): Promise<{ err: unknown }> {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) return { err: status.err };
    if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) return { err: null };
    // Every few polls, stop if the blockhash has expired (the transaction can no longer land).
    if (attempt % 8 === 7 && (await connection.getBlockHeight("confirmed")) > lastValidBlockHeight) {
      throw new ConfirmTimeoutError();
    }
    if (Date.now() - started > 90_000) throw new ConfirmTimeoutError();
    await new Promise((r) => setTimeout(r, Math.min(300 + attempt * 100, 1500)));
  }
}

