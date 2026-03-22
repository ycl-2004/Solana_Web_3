// create-token-with-metaplex.ts
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplTokenMetadata,
  createV1,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  generateSigner,
  percentAmount,
  keypairIdentity,
} from "@metaplex-foundation/umi";
import { loadWallet } from "./config";

async function createTokenWithMetaplex() {
  // 初始化 Umi
  const umi = createUmi("https://api.devnet.solana.com").use(
    mplTokenMetadata(),
  );

  // 加载钱包
  const wallet = loadWallet();
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(wallet.secretKey);
  umi.use(keypairIdentity(umiKeypair));

  // 生成 Mint 密钥对
  const mint = generateSigner(umi);

  console.log("创建带 Metaplex 元数据的代币...");

  // 创建代币（同时创建 Mint 和 Metadata）
  await createV1(umi, {
    mint,
    name: "Solana University Token",
    symbol: "SOLU",
    uri: "https://arweave.net/your-metadata-json",
    sellerFeeBasisPoints: percentAmount(0), // 无版税
    decimals: 6,
    tokenStandard: TokenStandard.Fungible,
  }).sendAndConfirm(umi);

  console.log("创建成功！");
  console.log("Mint 地址:", mint.publicKey);
}

createTokenWithMetaplex();
