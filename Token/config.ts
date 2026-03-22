import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import fs from "fs";

export const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

export function loadWallet(): Keypair {
  const path = `${process.env.HOME}/.config/solana/id.json`;

  if (!fs.existsSync(path)) {
    throw new Error(`找不到钱包文件: ${path}`);
  }

  const secretKey = JSON.parse(fs.readFileSync(path, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;

  if (fractionalPart === 0n) {
    return integerPart.toString();
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  return `${integerPart}.${fractionalStr.replace(/0+$/, "")}`;
}
