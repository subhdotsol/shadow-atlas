"use client";

import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { Keypair, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { baseConnection } from "@/lib/program";

/**
 * The player key: a keypair kept in this browser that signs every game transaction.
 *
 * Browser wallet extensions check each transaction against their own Solana RPC, so they
 * refuse transactions bound for MagicBlock's private rollup (its blockhash and delegated
 * accounts only exist there). Following MagicBlock's own examples, the game is played from
 * a local key; the browser wallet only funds it and receives withdrawals. A side effect is
 * that moves need no wallet prompt.
 *
 * Keep only game money on it: it lives in localStorage.
 */
const STORAGE_KEY = "shadow-atlas:player-key:v1";

let cached: Keypair | null = null;
let persisted = true;

function loadOrCreate(): Keypair {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      cached = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored)));
      return cached;
    }
    cached = Keypair.generate();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(cached.secretKey)));
  } catch {
    // Storage blocked (private mode): keep a key for this tab only.
    cached ??= Keypair.generate();
    persisted = false;
  }
  return cached;
}

const subscribe = () => () => {};
const getSnapshot = () => loadOrCreate();
const getServerSnapshot = () => null;

export function keypairWallet(keypair: Keypair): AnchorWallet {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if ("version" in tx) tx.sign([keypair]);
      else tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      for (const tx of txs) {
        if ("version" in tx) tx.sign([keypair]);
        else tx.partialSign(keypair);
      }
      return txs;
    },
  };
}

type PlayerKey = {
  keypair: Keypair | null;
  wallet: AnchorWallet | null;
  /** Balance in lamports; null until first loaded. */
  balance: number | null;
  persisted: boolean;
  refreshBalance: () => void;
};

const Ctx = createContext<PlayerKey | null>(null);

export function PlayerKeyProvider({ children }: { children: ReactNode }) {
  // Null during server rendering, the browser key afterwards.
  const keypair = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const wallet = keypair ? keypairWallet(keypair) : null;
  const [balance, setBalance] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!keypair) return;
    let cancelled = false;
    const load = () =>
      baseConnection()
        .getBalance(keypair.publicKey, "confirmed")
        .then((lamports) => !cancelled && setBalance(lamports))
        .catch(() => {});
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [keypair, tick]);

  const value: PlayerKey = {
    keypair,
    wallet,
    balance,
    persisted,
    refreshBalance: () => setTick((t) => t + 1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayerKey() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayerKey must be used inside PlayerKeyProvider");
  return ctx;
}
