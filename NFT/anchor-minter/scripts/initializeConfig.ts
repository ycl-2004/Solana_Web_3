import * as fs from "fs";
import * as path from "path";

import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

const ANCHOR_MINTER_PROGRAM_ID = new PublicKey(
  "4ZGqxpGWvEC71CDC1tghV7meg6fQ1hnKVgn2iUTYzb56"
);
const COLLECTION_MINT = new PublicKey(
  "9KuHMCwUmWKsSFiwH3h6TLWKoMSBQe3EtChcjJGCfmAi"
);

function loadIdl() {
  const idlPath = path.join(__dirname, "..", "target", "idl", "anchor_minter.json");
  return JSON.parse(fs.readFileSync(idlPath, "utf8"));
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = loadIdl();
  const program = new anchor.Program(idl, provider) as anchor.Program;

  // 这次我们走免费 mint，所以 mint price 设成 0。
  const mintPrice = new BN(0);
  const maxSupply = 100;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    ANCHOR_MINTER_PROGRAM_ID
  );

  console.log("开始初始化 devnet MintConfig...");
  console.log("Program ID:", ANCHOR_MINTER_PROGRAM_ID.toBase58());
  console.log("Config PDA:", configPda.toBase58());
  console.log("Collection Mint:", COLLECTION_MINT.toBase58());

  const tx = await program.methods
    .initialize(COLLECTION_MINT, mintPrice, maxSupply)
    .accounts({
      authority: provider.wallet.publicKey,
      treasury: provider.wallet.publicKey,
    })
    .rpc();

  console.log("初始化成功");
  console.log("Transaction Signature:", tx);
}

main().catch((error) => {
  console.error("initializeConfig 失败:", error);
  process.exit(1);
});
