"use client";

import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import { Connection, type Keypair } from "@solana/web3.js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import nacl from "tweetnacl";
import { TEE_RPC, TEE_WS } from "@/lib/config";
import { usePlayerKey } from "./player-key";

/**
 * The private rollup only answers callers that prove who they are: the player key signs a
 * challenge and gets a session token. Every rollup read and write goes through a connection
 * carrying that token, which is how the TEE knows what this player may see. The player key
 * signs locally, so this happens automatically.
 */
type TeeSession = {
  connection: Connection | null;
  authenticating: boolean;
  error: string | null;
  retry: () => void;
};

const Ctx = createContext<TeeSession | null>(null);

type Stored = { token: string; expiresAt: number };
const storageKey = (pubkey: string) => `shadow-atlas:tee:${pubkey}`;

function loadToken(pubkey: string): string | null {
  try {
    const raw = sessionStorage.getItem(storageKey(pubkey));
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored;
    // Treat tokens within a minute of expiry as expired.
    return stored.expiresAt - 60_000 > Date.now() ? stored.token : null;
  } catch {
    return null;
  }
}

async function requestToken(keypair: Keypair): Promise<string> {
  const { token, expiresAt } = await getAuthToken(TEE_RPC, keypair.publicKey, async (message) =>
    nacl.sign.detached(message, keypair.secretKey),
  );
  try {
    sessionStorage.setItem(storageKey(keypair.publicKey.toBase58()), JSON.stringify({ token, expiresAt }));
  } catch {
    // Private mode: re-authenticate after a reload.
  }
  return token;
}

function connectionFor(token: string) {
  return new Connection(`${TEE_RPC}?token=${token}`, { wsEndpoint: `${TEE_WS}?token=${token}`, commitment: "confirmed" });
}

export function TeeSessionProvider({ children }: { children: ReactNode }) {
  const { keypair } = usePlayerKey();
  const pubkey = keypair?.publicKey.toBase58() ?? null;
  const [fresh, setFresh] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const token = pubkey ? (fresh[pubkey] ?? loadToken(pubkey)) : null;
  const needsToken = Boolean(keypair && !token);

  useEffect(() => {
    if (!keypair || !needsToken) return;
    let cancelled = false;
    requestToken(keypair)
      .then((t) => {
        if (cancelled) return;
        setFailed(null);
        setFresh((f) => ({ ...f, [keypair.publicKey.toBase58()]: t }));
      })
      .catch(() => {
        if (!cancelled) setFailed(keypair.publicKey.toBase58());
      });
    return () => {
      cancelled = true;
    };
  }, [keypair, needsToken, attempt]);

  const error = failed && failed === pubkey ? "Couldn't connect to the private rollup." : null;
  const value: TeeSession = {
    // The compiler memoizes this per token.
    connection: token ? connectionFor(token) : null,
    authenticating: needsToken && !error,
    error,
    retry: () => {
      setFailed(null);
      setAttempt((a) => a + 1);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTeeSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTeeSession must be used inside TeeSessionProvider");
  return ctx;
}
