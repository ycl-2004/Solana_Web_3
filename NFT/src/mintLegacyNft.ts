import {
  createNft,
  findMasterEditionPda,
  findMetadataPda,
  setAndVerifySizedCollectionItem,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  generateSigner,
  percentAmount,
  publicKey,
} from "@metaplex-foundation/umi";
import { createUmiInstance } from "./setup";

export async function mintLegacyNft(): Promise<void> {
  // 1. 创建 Umi 实例
  // 这里会读取你本地的钱包，它同时也是这次 verify 时使用的 Collection Authority
  const umi = createUmiInstance();

  // 2. 准备两个关键地址
  // collectionMintAddress: 你前面已经创建成功的 Collection NFT 地址
  // nftMetadataUri: 这张普通 NFT 自己的 metadata URI
  const collectionMintAddress = "9KuHMCwUmWKsSFiwH3h6TLWKoMSBQe3EtChcjJGCfmAi";
  const nftMetadataUri =
    "https://gateway.irys.xyz/7d6ohCezCJamkiHKNVTb56HWpfvHU3d4yqbxwBcvVJ8B";

  // 3. 生成一张全新的普通 NFT mint 地址
  const nftMint = generateSigner(umi);

  console.log("开始铸造 Legacy 普通 NFT...");
  console.log("NFT Mint Address:", nftMint.publicKey);
  console.log("Collection Address:", collectionMintAddress);
  console.log("NFT Metadata URI:", nftMetadataUri);

  // 4. 先创建普通 NFT
  // 这里先只把 NFT 本身铸造出来，还不在这一步直接做 collection verify
  // 这样可以把“创建 NFT”和“加入 collection 并验证”分成两个更清楚的步骤
  await createNft(umi, {
    mint: nftMint,
    name: "future #1",
    uri: nftMetadataUri,
    sellerFeeBasisPoints: percentAmount(5),
  }).sendAndConfirm(umi);

  console.log("\n普通 NFT 创建成功");

  // 5. 找到这张 NFT 对应的 Metadata PDA
  // setAndVerifyCollection 需要普通 NFT 的 metadata 地址
  const nftMetadata = findMetadataPda(umi, {
    mint: nftMint.publicKey,
  });

  // 6. 找到 Collection NFT 自己的 metadata 和 master edition PDA
  // 这两个账户是 Token Metadata 程序在 verify 时需要检查的关键账户
  const collectionMetadata = findMetadataPda(umi, {
    mint: publicKey(collectionMintAddress),
  });
  const collectionMasterEdition = findMasterEditionPda(umi, {
    mint: publicKey(collectionMintAddress),
  });

  // 7. 由 Collection Authority 执行 set + verify
  // 这一步会同时完成两件事：
  // - 把普通 NFT 挂到指定 collection 上
  // - 立刻完成官方验证
  // 注意：因为我们前面创建 collection 时用了 `isCollection: true`
  // 这版 mpl-token-metadata 会把它做成 sized collection
  // 所以后面要使用 `setAndVerifySizedCollectionItem`
  await setAndVerifySizedCollectionItem(umi, {
    metadata: nftMetadata,
    collectionAuthority: umi.identity,
    updateAuthority: umi.identity.publicKey,
    collectionMint: publicKey(collectionMintAddress),
    collection: collectionMetadata,
    collectionMasterEditionAccount: collectionMasterEdition,
  }).sendAndConfirm(umi);

  // 8. 打印最终结果
  console.log("\nLegacy 普通 NFT 铸造并验证完成");
  console.log("NFT Address:", nftMint.publicKey);
  console.log("Collection Address:", collectionMintAddress);
}

async function main() {
  // 9. 直接执行完整流程：先 mint，再 set and verify collection
  await mintLegacyNft();
}

main().catch((error) => {
  console.error("铸造 Legacy 普通 NFT 失败:", error);
  process.exit(1);
});
