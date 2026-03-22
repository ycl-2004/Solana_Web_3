// approve-delegate.ts
import {
  approve,
  revoke,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  getMint,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { connection, loadWallet } from "./config";

async function showDelegateStatus(mintAddress: string) {
  const payer = loadWallet();
  const mint = new PublicKey(mintAddress);

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  );

  const accountInfo = await getAccount(connection, tokenAccount.address);

  console.log("Token Account:", tokenAccount.address.toBase58());
  console.log("当前委托人:", accountInfo.delegate?.toBase58() || "无");
  console.log("委托额度:", accountInfo.delegatedAmount.toString());
  console.log("余额:", accountInfo.amount.toString());
}

async function approveDelegate(
  mintAddress: string,
  delegateAddress: string,
  amount: number,
) {
  const payer = loadWallet();
  const mint = new PublicKey(mintAddress);
  const delegate = new PublicKey(delegateAddress);

  const mintInfo = await getMint(connection, mint);
  const rawAmount = BigInt(amount * 10 ** mintInfo.decimals);

  // 获取 owner 的 ATA
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  );

  // 授权 delegate
  const signature = await approve(
    connection,
    payer,
    tokenAccount.address,
    delegate,
    payer,
    rawAmount,
  );

  console.log("授权成功！");
  console.log("委托人:", delegateAddress);
  console.log("授权额度:", amount);
  console.log("交易签名:", signature);

  await showDelegateStatus(mintAddress);
}

async function revokeDelegate(mintAddress: string) {
  const payer = loadWallet();
  const mint = new PublicKey(mintAddress);

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  );

  const signature = await revoke(
    connection,
    payer,
    tokenAccount.address,
    payer,
  );

  console.log("已撤销授权");
  console.log("交易签名:", signature);

  await showDelegateStatus(mintAddress);
}

const [, , action, mintAddress, delegateAddress, amount] = process.argv;

if (action === "approve") {
  if (!mintAddress || !delegateAddress || !amount) {
    console.error(
      "用法: npx ts-node approve-delegate.ts approve <MINT> <DELEGATE> <AMOUNT>",
    );
    process.exit(1);
  }

  approveDelegate(mintAddress, delegateAddress, Number(amount))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("错误:", err);
      process.exit(1);
    });
} else if (action === "revoke") {
  if (!mintAddress) {
    console.error("用法: npx ts-node approve-delegate.ts revoke <MINT>");
    process.exit(1);
  }

  revokeDelegate(mintAddress)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("错误:", err);
      process.exit(1);
    });
} else if (action === "status") {
  if (!mintAddress) {
    console.error("用法: npx ts-node approve-delegate.ts status <MINT>");
    process.exit(1);
  }

  showDelegateStatus(mintAddress)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("错误:", err);
      process.exit(1);
    });
} else {
  console.error("用法:");
  console.error(
    "  npx ts-node approve-delegate.ts approve <MINT> <DELEGATE> <AMOUNT>",
  );
  console.error("  npx ts-node approve-delegate.ts revoke <MINT>");
  console.error("  npx ts-node approve-delegate.ts status <MINT>");
  process.exit(1);
}
