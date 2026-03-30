import { createUmiInstance } from "./setup";
import { sol } from "@metaplex-foundation/umi";

async function main() {
  const umi = createUmiInstance();

  console.log("🔗 连接到:", umi.rpc.getEndpoint());
  console.log("👤 当前身份:", umi.identity.publicKey);

  // 获取余额
  const balance = await umi.rpc.getBalance(umi.identity.publicKey);

  // Umi 的金额处理更人性化
  // balance 是一个带单位的对象: { basisPoints: 1500000000n, identifier: 'SOL', decimals: 9 }
  console.log(`💰 余额: ${Number(balance.basisPoints) / 1e9} SOL`);

  if (balance.basisPoints < sol(0.1).basisPoints) {
    console.warn("⚠️ 余额不足，请运行 'solana airdrop 2' 补充燃料！");
  }
}

main();
