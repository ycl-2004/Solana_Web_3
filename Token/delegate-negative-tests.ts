// delegate-negative-tests.ts
import {
  approve,
  revoke,
  getAccount,
  getMint,
  getOrCreateAssociatedTokenAccount,
  transferChecked,
} from "@solana/spl-token";
import { PublicKey, Keypair } from "@solana/web3.js";
import { connection, loadWallet } from "./config";
import fs from "fs";
import os from "os";
import path from "path";

function loadWalletFromFile(filePath: string): Keypair {
  const fullPath = filePath.startsWith("~")
    ? path.join(os.homedir(), filePath.slice(2))
    : filePath;

  const secretKeyString = fs.readFileSync(fullPath, "utf-8");
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

async function approveForTest(
  mintAddress: string,
  delegateAddress: string,
  amount: number,
) {
  const payer = loadWallet();
  const mint = new PublicKey(mintAddress);
  const delegate = new PublicKey(delegateAddress);

  const mintInfo = await getMint(connection, mint);
  const rawAmount = BigInt(amount * 10 ** mintInfo.decimals);

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  );

  const signature = await approve(
    connection,
    payer,
    tokenAccount.address,
    delegate,
    payer,
    rawAmount,
  );

  console.log("approve 成功，签名:", signature);
}

async function revokeForTest(mintAddress: string) {
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

  console.log("revoke 成功，签名:", signature);
}

async function showStatus(mintAddress: string) {
  const payer = loadWallet();
  const mint = new PublicKey(mintAddress);

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  );

  const info = await getAccount(connection, tokenAccount.address);

  console.log("Token Account:", tokenAccount.address.toBase58());
  console.log("当前委托人:", info.delegate?.toBase58() || "无");
  console.log("委托额度:", info.delegatedAmount.toString());
  console.log("余额:", info.amount.toString());
}

async function delegateTransferExpectFailure(
  mintAddress: string,
  ownerAddress: string,
  recipientAddress: string,
  amount: number,
  delegateKeypairPath: string,
) {
  const mint = new PublicKey(mintAddress);
  const owner = new PublicKey(ownerAddress);
  const recipient = new PublicKey(recipientAddress);
  const delegate = loadWalletFromFile(delegateKeypairPath);

  const mintInfo = await getMint(connection, mint);
  const rawAmount = BigInt(amount * 10 ** mintInfo.decimals);

  const ownerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    delegate,
    mint,
    owner,
  );

  const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    delegate,
    mint,
    recipient,
  );

  try {
    await transferChecked(
      connection,
      delegate,
      ownerTokenAccount.address,
      mint,
      recipientTokenAccount.address,
      delegate,
      rawAmount,
      mintInfo.decimals,
    );

    console.error("❌ 预期失败，但实际成功了");
    process.exit(1);
  } catch (err) {
    console.log("✅ 预期失败，实际失败");
    console.log("错误信息:", err);
  }
}

async function overwriteDelegateTest(
  mintAddress: string,
  firstDelegate: string,
  secondDelegate: string,
  firstAmount: number,
  secondAmount: number,
) {
  console.log("开始测试：第二次 approve 覆盖第一次 delegate");

  await approveForTest(mintAddress, firstDelegate, firstAmount);
  console.log("第一次授权后状态：");
  await showStatus(mintAddress);

  await approveForTest(mintAddress, secondDelegate, secondAmount);
  console.log("第二次授权后状态：");
  await showStatus(mintAddress);

  console.log("✅ 如果当前委托人是第二个地址，就说明覆盖成功");
}

const [, , action, ...args] = process.argv;

if (action === "expect-fail-transfer") {
  const [
    mintAddress,
    ownerAddress,
    recipientAddress,
    amount,
    delegateKeypairPath,
  ] = args;

  if (
    !mintAddress ||
    !ownerAddress ||
    !recipientAddress ||
    !amount ||
    !delegateKeypairPath
  ) {
    console.error(
      "用法: npx ts-node delegate-negative-tests.ts expect-fail-transfer <MINT> <OWNER> <RECIPIENT> <AMOUNT> <DELEGATE_KEYPAIR_PATH>",
    );
    process.exit(1);
  }

  delegateTransferExpectFailure(
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
} else if (action === "overwrite-delegate") {
  const [
    mintAddress,
    firstDelegate,
    secondDelegate,
    firstAmount,
    secondAmount,
  ] = args;

  if (
    !mintAddress ||
    !firstDelegate ||
    !secondDelegate ||
    !firstAmount ||
    !secondAmount
  ) {
    console.error(
      "用法: npx ts-node delegate-negative-tests.ts overwrite-delegate <MINT> <FIRST_DELEGATE> <SECOND_DELEGATE> <FIRST_AMOUNT> <SECOND_AMOUNT>",
    );
    process.exit(1);
  }

  overwriteDelegateTest(
    mintAddress,
    firstDelegate,
    secondDelegate,
    Number(firstAmount),
    Number(secondAmount),
  )
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("错误:", err);
      process.exit(1);
    });
} else if (action === "revoke") {
  const [mintAddress] = args;

  if (!mintAddress) {
    console.error("用法: npx ts-node delegate-negative-tests.ts revoke <MINT>");
    process.exit(1);
  }

  revokeForTest(mintAddress)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("错误:", err);
      process.exit(1);
    });
} else if (action === "status") {
  const [mintAddress] = args;

  if (!mintAddress) {
    console.error("用法: npx ts-node delegate-negative-tests.ts status <MINT>");
    process.exit(1);
  }

  showStatus(mintAddress)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("错误:", err);
      process.exit(1);
    });
} else {
  console.error("用法:");
  console.error(
    "  npx ts-node delegate-negative-tests.ts expect-fail-transfer <MINT> <OWNER> <RECIPIENT> <AMOUNT> <DELEGATE_KEYPAIR_PATH>",
  );
  console.error(
    "  npx ts-node delegate-negative-tests.ts overwrite-delegate <MINT> <FIRST_DELEGATE> <SECOND_DELEGATE> <FIRST_AMOUNT> <SECOND_AMOUNT>",
  );
  console.error("  npx ts-node delegate-negative-tests.ts revoke <MINT>");
  console.error("  npx ts-node delegate-negative-tests.ts status <MINT>");
  process.exit(1);
}
