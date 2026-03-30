import * as fs from "fs";
import * as path from "path";

import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findCollectionAuthorityRecordPda,
  findMasterEditionPda,
  findMetadataPda,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey } from "@metaplex-foundation/umi";

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
  // 1. 这里默认读取环境变量里的 provider。
  // 如果你之后部署到 devnet，可以像这样运行：
  // ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/mintNftWithMetadata.ts
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = loadIdl();
  const program = new anchor.Program(idl, provider) as anchor.Program;

  // 2. 新建这次要 mint 的 NFT mint keypair。
  const nftMint = Keypair.generate();

  // 3. 用 Umi 只做 PDA 计算，这样继续沿用你前面 Metaplex 的工具链。
  const umi = createUmi(provider.connection.rpcEndpoint).use(mplTokenMetadata());
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    ANCHOR_MINTER_PROGRAM_ID
  );

  const nftMintPk = publicKey(nftMint.publicKey.toBase58());
  const collectionMintPk = publicKey(COLLECTION_MINT.toBase58());
  const configPdaPk = publicKey(configPda.toBase58());

  const [nftMetadata] = findMetadataPda(umi, { mint: nftMintPk });
  const [nftMasterEdition] = findMasterEditionPda(umi, { mint: nftMintPk });
  const [collectionMetadata] = findMetadataPda(umi, { mint: collectionMintPk });
  const [collectionMasterEdition] = findMasterEditionPda(umi, {
    mint: collectionMintPk,
  });
  const [collectionAuthorityRecord] = findCollectionAuthorityRecordPda(umi, {
    mint: collectionMintPk,
    collectionAuthority: configPdaPk,
  });

  console.log("开始调用完整 mint_nft_with_metadata...");
  console.log("Program ID:", ANCHOR_MINTER_PROGRAM_ID.toBase58());
  console.log("Config PDA:", configPda.toBase58());
  console.log("New NFT Mint:", nftMint.publicKey.toBase58());

  // 4. 这里就是完整的“免费 mint + metadata + collection verify”入口。
  // 现在默认用你前面已经上传好的 metadata URI 来做一张示范 NFT。
  const tx = await program.methods
    .mintNftWithMetadata(
      "future member",
      "FUTURE",
      "https://gateway.irys.xyz/7d6ohCezCJamkiHKNVTb56HWpfvHU3d4yqbxwBcvVJ8B"
    )
    .accounts({
      minter: provider.wallet.publicKey,
      nftMint: nftMint.publicKey,
      nftMetadata,
      nftMasterEdition,
      collectionMint: COLLECTION_MINT,
      collectionMetadata,
      collectionMasterEdition,
      collectionAuthorityRecord,
      collectionUpdateAuthority: provider.wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([nftMint])
    .rpc();

  console.log("Mint 成功");
  console.log("Transaction Signature:", tx);
  console.log("NFT Mint:", nftMint.publicKey.toBase58());
  console.log("NFT Metadata PDA:", nftMetadata);
  console.log("NFT Master Edition PDA:", nftMasterEdition);
}

main().catch((error) => {
  console.error("mintNftWithMetadata 失败:", error);
  process.exit(1);
});
