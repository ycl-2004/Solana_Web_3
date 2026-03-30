import {
  createNft,
} from "@metaplex-foundation/mpl-token-metadata";
import { generateSigner, percentAmount } from "@metaplex-foundation/umi";
import { createUmiInstance } from "./setup";

export async function createLegacyCollection(): Promise<void> {
  // 1. 创建 Umi 实例
  // 这里会连接到 devnet，并加载你本地的钱包身份
  const umi = createUmiInstance();

  // 2. 准备 Collection 的 metadata URI
  // 这个 URI 就是你上一步上传 metadata JSON 后拿到的网址
  // createNft 时，链上会把这个 URI 存进 NFT 的 metadata 里
  const metadataUri =
    "https://gateway.irys.xyz/4YxGk4wh8xDczuFyZcLnYeuNajbZdNnBUw61ZLKwvL8R";

  // 3. 生成一个新的 Mint signer
  // 这个 signer 代表“这一个 Collection NFT 的 mint 账户”
  // 你可以把它理解成：现在要创建一个全新的 NFT，所以需要一个全新的地址
  const collectionMint = generateSigner(umi);

  console.log("开始创建 Legacy Collection NFT...");
  console.log("Collection Mint Address:", collectionMint.publicKey);
  console.log("Metadata URI:", metadataUri);

  // 4. 调用 createNft 创建 Collection NFT
  // 关键点：
  // - mint: 这次新 NFT 的 mint 地址
  // - name: Collection 的名字
  // - uri: 指向链下 metadata JSON
  // - sellerFeeBasisPoints: 版税设置
  // - isCollection: true，表示这不是普通 NFT，而是 Collection NFT
  await createNft(umi, {
    mint: collectionMint,
    name: "future",
    uri: metadataUri,
    sellerFeeBasisPoints: percentAmount(5),
    isCollection: true,
  }).sendAndConfirm(umi);

  // 5. 输出创建结果
  // 这个 publicKey 非常重要，后面普通 NFT 要加入这个 collection 时会用到它
  console.log("\nLegacy Collection 创建成功");
  console.log("Collection Address:", collectionMint.publicKey);

}

async function main() {
  // 6. 直接执行创建流程
  await createLegacyCollection();
}

// 8. 如果创建失败，就把错误打印出来
main().catch((error) => {
  console.error("创建 Legacy Collection 失败:", error);
  process.exit(1);
});
