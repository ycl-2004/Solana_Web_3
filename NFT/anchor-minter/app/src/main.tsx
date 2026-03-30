import React from "react";
import ReactDOM from "react-dom/client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";

import App from "./App";
import "./styles.css";
import "@solana/wallet-adapter-react-ui/styles.css";

const endpoint = "https://api.devnet.solana.com";
const wallets = [new PhantomWalletAdapter()];
const SafeConnectionProvider = ConnectionProvider as unknown as React.ComponentType<any>;
const SafeWalletProvider = WalletProvider as unknown as React.ComponentType<any>;
const SafeWalletModalProvider = WalletModalProvider as unknown as React.ComponentType<any>;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SafeConnectionProvider endpoint={endpoint}>
      <SafeWalletProvider wallets={wallets} autoConnect>
        <SafeWalletModalProvider>
          <App />
        </SafeWalletModalProvider>
      </SafeWalletProvider>
    </SafeConnectionProvider>
  </React.StrictMode>
);
