// delegate-transfer.ts
import {
  getOrCreateAssociatedTokenAccount,
  getMint,
  transferChecked,
  getAccount,
} from "@solana/spl-token";
import { PublicKey, Keypair } from "@solana/web3.js";
import { connection } from "./config";
import fs from "fs";
import os from "os";
import path from "path";

// 加载指定路径的钱包
function loadWalletFromFile(filePath: string): Keypair {
  const fullPath = filePath.startsWith("~")
    ? path.join(os.homedir(), filePath.slice(2))
    : filePath;

  const secretKeyString = fs.readFileSync(fullPath, "utf-8");
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

async function delegateTransfer(
  mintAddress: string,
  ownerAddress: string,
  recipientAddress: string,
  amount: number,
  delegateKeypairPath: string,
) {
  console.log("开始执行 delegate 转账...");
  console.log("Mint:", mintAddress);
  console.log("Owner:", ownerAddress);
  console.log("Recipient:", recipientAddress);
  console.log("Amount:", amount);

  const mint = new PublicKey(mintAddress);
  const owner = new PublicKey(ownerAddress);
  const recipient = new PublicKey(recipientAddress);

  // delegate 钱包：真正签名转账的人
  const delegate = loadWalletFromFile(delegateKeypairPath);
  console.log("Delegate 钱包:", delegate.publicKey.toBase58());

  const mintInfo = await getMint(connection, mint);
  const rawAmount = BigInt(amount * 10 ** mintInfo.decimals);

  // owner 的 token account（来源）
  const ownerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    delegate,
    mint,
    owner,
  );

  // recipient 的 token account（接收）
  const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    delegate,
    mint,
    recipient,
  );

  console.log("Owner Token Account:", ownerTokenAccount.address.toBase58());
  console.log(
    "Recipient Token Account:",
    recipientTokenAccount.address.toBase58(),
  );

  const beforeInfo = await getAccount(connection, ownerTokenAccount.address);
  console.log("转账前委托人:", beforeInfo.delegate?.toBase58() || "无");
  console.log("转账前委托额度:", beforeInfo.delegatedAmount.toString());
  console.log("转账前余额:", beforeInfo.amount.toString());

  const signature = await transferChecked(
    connection,
    delegate,
    ownerTokenAccount.address,
    mint,
    recipientTokenAccount.address,
    delegate,
    rawAmount,
    mintInfo.decimals,
  );

  console.log("Delegate 转账成功！");
  console.log("交易签名:", signature);

  const afterInfo = await getAccount(connection, ownerTokenAccount.address);
  console.log("转账后委托人:", afterInfo.delegate?.toBase58() || "无");
  console.log("转账后委托额度:", afterInfo.delegatedAmount.toString());
  console.log("转账后余额:", afterInfo.amount.toString());
}

const [
  ,
  ,
  mintAddress,
  ownerAddress,
  recipientAddress,
  amount,
  delegateKeypairPath,
] = process.argv;

if (
  !mintAddress ||
  !ownerAddress ||
  !recipientAddress ||
  !amount ||
  !delegateKeypairPath
) {
  console.error("用法:");
  console.error(
    "npx ts-node delegate-transfer.ts <MINT> <OWNER_WALLET> <RECIPIENT_WALLET> <AMOUNT> <DELEGATE_KEYPAIR_PATH>",
  );
  process.exit(1);
}

delegateTransfer(
  mintAddress,
  ownerAddress,
  recipientAddress,
  Number(amount),
  delegateKeypairPath,
)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("错误:", err);
    process.exit(1);
  });
