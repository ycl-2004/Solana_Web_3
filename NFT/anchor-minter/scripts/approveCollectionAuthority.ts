import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { Keypair, PublicKey } from "@solana/web3.js";
import { approveCollectionAuthority, findCollectionAuthorityRecordPda, findMetadataPda, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createSignerFromKeypair, publicKey, signerIdentity } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";

// 这里继续使用你已经存在的 devnet collection。
const COLLECTION_MINT = "9KuHMCwUmWKsSFiwH3h6TLWKoMSBQe3EtChcjJGCfmAi";

// 这个 Program ID 必须和当前 anchor-minter 的 declare_id! 保持一致。
const ANCHOR_MINTER_PROGRAM_ID = "4ZGqxpGWvEC71CDC1tghV7meg6fQ1hnKVgn2iUTYzb56";

function loadLocalWallet(): Keypair {
  const walletPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function main() {
  // 1. 创建一个直连 devnet 的 Umi 实例。
  // 这一步是为了用你现在主钱包的权限，给程序 PDA 一次性授权。
  const umi = createUmi("https://api.devnet.solana.com").use(mplTokenMetadata());

  // 2. 读取你本机的 Solana 钱包，并设置成这次交易的 signer。
  // 这个 signer 必须就是当前 collection 的 update authority。
  const wallet = loadLocalWallet();
  const umiKeypair = fromWeb3JsKeypair(wallet);
  const signer = createSignerFromKeypair(umi, umiKeypair);
  umi.use(signerIdentity(signer));

  // 3. 计算 config PDA。
  // 这个 PDA 就是你 Anchor 程序之后用来自动 verify collection 的“程序身份”。
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    new PublicKey(ANCHOR_MINTER_PROGRAM_ID)
  );

  const collectionMint = publicKey(COLLECTION_MINT);
  const collectionAuthority = publicKey(configPda.toBase58());

  // 4. 计算 Metaplex 需要的两个 PDA：
  // - collection metadata PDA
  // - collection authority record PDA
  const [collectionMetadata] = findMetadataPda(umi, { mint: collectionMint });
  const [collectionAuthorityRecord] = findCollectionAuthorityRecordPda(umi, {
    mint: collectionMint,
    collectionAuthority,
  });

  console.log("开始授权 collection authority delegate...");
  console.log("Collection Mint:", COLLECTION_MINT);
  console.log("Program Config PDA:", configPda.toBase58());
  console.log("Collection Metadata PDA:", collectionMetadata);
  console.log("Collection Authority Record PDA:", collectionAuthorityRecord);

  // 5. 这一步会把“config PDA”注册成这个 collection 的 delegate authority。
  // 做完以后，你的主钱包仍然是总 owner，
  // 但程序 PDA 也会拥有“替这个 collection 做 verify”的权限。
  const result = await approveCollectionAuthority(umi, {
    mint: collectionMint,
    metadata: collectionMetadata,
    newCollectionAuthority: collectionAuthority,
    collectionAuthorityRecord,
  }).sendAndConfirm(umi);

  console.log("授权成功");
  console.log("Transaction Signature:", result.signature);
  console.log("以后程序会使用这个 record PDA 来自动 verify NFT。");
}

main().catch((error) => {
  console.error("授权 collection authority 失败:", error);
  process.exit(1);
});
