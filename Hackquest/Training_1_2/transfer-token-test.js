// 引入 Solana web3.js 主库
const solanaWeb3 = require("@solana/web3.js");

// 引入 SPL Token 库
const splToken = require("@solana/spl-token");

// 引入 fs，用来读取本机钱包文件
const fs = require("fs");

// 建立到 Solana Devnet 的连接
const connection = new solanaWeb3.Connection("https://api.devnet.solana.com", {
  wsEndpoint: "wss://api.devnet.solana.com",
  commitment: "confirmed",
});

/**
 * 从本机 JSON 钱包文件读取 Keypair
 *
 * @param {string} path - 钱包文件路径
 * @returns {solanaWeb3.Keypair}
 */
function loadKeypair(path) {
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8")));

  return solanaWeb3.Keypair.fromSecretKey(secretKey);
}

/**
 * 主函数：把你刚创建的 SPL Token
 * 从 acc1（主钱包）转到 acc2（second wallet）
 */
async function main() {
  // -----------------------------
  // 1) 读取两个钱包
  // -----------------------------
  const sender = loadKeypair("/Users/yichenlin/.config/solana/id.json");
  const receiver = loadKeypair("/Users/yichenlin/second-wallet.json");

  console.log("发送方钱包 Sender:", sender.publicKey.toBase58());
  console.log("接收方钱包 Receiver:", receiver.publicKey.toBase58());

  // -----------------------------
  // 2) 指定你刚刚创建的 Mint 地址
  // -----------------------------
  // 这就是你 mint-token-test.js 输出的那个 Mint
  const mint = new solanaWeb3.PublicKey(
    "HTfEGMJ8uvEA6g4X5D97VLbBZeDfNhbxHMBn521rqSw1",
  );

  console.log("本次要转的 Token Mint:", mint.toBase58());

  // -----------------------------
  // 3) 取得发送方 ATA
  // -----------------------------
  // 发送方已经持有这个 token，所以它的 ATA 应该已经存在
  const senderTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    sender,
    mint,
    sender.publicKey,
  );

  console.log("发送方 ATA:", senderTokenAccount.address.toBase58());

  // -----------------------------
  // 4) 取得接收方 ATA
  // -----------------------------
  // 接收方如果还没有持有过这个 token，
  // 这里会自动帮它创建一个 ATA
  const receiverTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    sender, // 由 sender 付创建 ATA 的手续费
    mint,
    receiver.publicKey,
  );

  console.log("接收方 ATA:", receiverTokenAccount.address.toBase58());

  // -----------------------------
  // 5) 查询转账前余额
  // -----------------------------
  const senderBalanceBefore = await connection.getTokenAccountBalance(
    senderTokenAccount.address,
  );

  const receiverBalanceBefore = await connection.getTokenAccountBalance(
    receiverTokenAccount.address,
  );

  console.log(
    "转账前 Sender token 原始余额:",
    senderBalanceBefore.value.amount,
  );
  console.log(
    "转账前 Sender token 可读余额:",
    senderBalanceBefore.value.uiAmountString,
  );

  console.log(
    "转账前 Receiver token 原始余额:",
    receiverBalanceBefore.value.amount,
  );
  console.log(
    "转账前 Receiver token 可读余额:",
    receiverBalanceBefore.value.uiAmountString,
  );

  // -----------------------------
  // 6) 执行 token transfer
  // -----------------------------
  //
  // 这里我们要转 10 个 token
  //
  // 你的 mint decimals = 9
  // 所以：
  // 10 token = 10 * 10^9 = 10000000000
  //
  // transferChecked(...) 比 transfer(...) 更安全，
  // 因为它会同时检查 mint 和 decimals 是否正确
  const amountToSend = 10 * 10 ** 9;

  const signature = await splToken.transferChecked(
    connection,
    sender, // payer：支付手续费的人
    senderTokenAccount.address, // source：发送方 token account
    mint, // mint：这是哪一种 token
    receiverTokenAccount.address, // destination：接收方 token account
    sender.publicKey, // owner：发送方 owner
    amountToSend, // amount：最小单位数量
    9, // decimals：这个 token 的小数位数
  );

  console.log("Token 转账交易签名:", signature);

  // -----------------------------
  // 7) 查询转账后余额
  // -----------------------------
  const senderBalanceAfter = await connection.getTokenAccountBalance(
    senderTokenAccount.address,
  );

  const receiverBalanceAfter = await connection.getTokenAccountBalance(
    receiverTokenAccount.address,
  );

  console.log("转账后 Sender token 原始余额:", senderBalanceAfter.value.amount);
  console.log(
    "转账后 Sender token 可读余额:",
    senderBalanceAfter.value.uiAmountString,
  );

  console.log(
    "转账后 Receiver token 原始余额:",
    receiverBalanceAfter.value.amount,
  );
  console.log(
    "转账后 Receiver token 可读余额:",
    receiverBalanceAfter.value.uiAmountString,
  );

  console.log("--------------------------------------------------");
  console.log("SPL Token 转账测试完成");
  console.log("Mint:", mint.toBase58());
  console.log("发送方 ATA:", senderTokenAccount.address.toBase58());
  console.log("接收方 ATA:", receiverTokenAccount.address.toBase58());
  console.log("本次转账数量: 10 tokens");
  console.log("--------------------------------------------------");
}

main().catch((error) => {
  console.error("程序执行出错：", error);
});
