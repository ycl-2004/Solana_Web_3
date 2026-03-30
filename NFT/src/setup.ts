import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity } from "@metaplex-foundation/umi";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { mplCore } from "@metaplex-foundation/mpl-core";
import * as fs from "fs";
import * as os from "os";

export function createUmiInstance() {
  // 1. 连接 RPC 节点 (这里使用 Devnet)
  const umi = createUmi("https://api.devnet.solana.com");

  // 2. 加载本地钱包 (id.json)
  // 这是你执行交易时的 "Signer" (签名者)
  const keypairPath = `${os.homedir()}/.config/solana/id.json`;
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));

  // 将私钥转换为 Umi 的 Keypair 格式
  const keypair = umi.eddsa.createKeypairFromSecretKey(
    new Uint8Array(keypairData),
  );

  // 3. 注册插件
  umi
    .use(keypairIdentity(keypair)) // 设置默认身份
    .use(mplTokenMetadata()) // 启用旧版 NFT 支持
    .use(mplCore()); // 启用 Core 标准支持

  return umi;
}
