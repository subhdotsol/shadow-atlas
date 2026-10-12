"use client";

import { Buffer } from "buffer";
import { WalletNotReadyError, type Adapter, type WalletError } from "@solana/wallet-adapter-base";
import { ConnectionProvider, useWallet, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { useEffect, type ReactNode } from "react";
import { BASE_RPC } from "@/lib/config";
import { debugError, debugLog } from "@/lib/debug-log";
import { PlayerKeyProvider } from "./player-key";
import { TeeSessionProvider } from "./tee-session";

// Anchor and web3.js expect Node's Buffer in the browser.
if (typeof window !== "undefined") {
  (window as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
}

/**
 * Without a handler the adapter console.errors every wallet failure, which Next.js turns
 * into an error overlay. Callers already catch these and show them in the UI, so only keep
 * the adapter's one useful default: sending people to install a wallet they picked.
 */
function onWalletError(error: WalletError, adapter?: Adapter) {
  if (error instanceof WalletNotReadyError && adapter) window.open(adapter.url, "_blank", "noopener");
}

/** Development only: log the wallet adapter's own requests (connect prompts included). */
function WalletDebugLog() {
  const { wallet } = useWallet();
  useEffect(() => {
    const adapter = wallet?.adapter;
    if (!adapter || process.env.NODE_ENV === "production") return;
    const onConnect = () => debugLog("wallet", `${adapter.name} connected`, { address: adapter.publicKey?.toBase58() });
    const onDisconnect = () => debugLog("wallet", `${adapter.name} disconnected`);
    const onError = (e: unknown) => debugError("wallet", `${adapter.name} adapter error`, e);
    adapter.on("connect", onConnect);
    adapter.on("disconnect", onDisconnect);
    adapter.on("error", onError);
    return () => {
      adapter.off("connect", onConnect);
      adapter.off("disconnect", onDisconnect);
      adapter.off("error", onError);
    };
  }, [wallet]);

  // Anything that escapes the app's own error handling.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const onError = (e: ErrorEvent) => debugError("page", "uncaught error", e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => debugError("page", "unhandled promise rejection", e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={BASE_RPC}>
      {/* The browser wallet only funds the player key. An empty list uses every installed
          Wallet Standard wallet (Phantom, Solflare, Backpack…). */}
      <WalletProvider wallets={[]} autoConnect onError={onWalletError}>
        <WalletDebugLog />
        <WalletModalProvider>
          <PlayerKeyProvider>
            <TeeSessionProvider>{children}</TeeSessionProvider>
          </PlayerKeyProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
