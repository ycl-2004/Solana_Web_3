// 引入 Solana web3.js 主库
// 用来连接 Solana、读取钱包、公钥处理等
const solanaWeb3 = require("@solana/web3.js");

// 引入 SPL Token 库
// 用来创建 mint、创建 token account、铸造代币等
const splToken = require("@solana/spl-token");

// 引入 Node.js 内建 fs 模块
// 用来读取本机钱包文件，例如 id.json
const fs = require("fs");

// 建立到 Solana Devnet 的连接
// 这里额外指定 commitment = "confirmed"
// 这样比默认模式更稳一点，比较不容易出现刚写完账户、下一步马上读不到的问题
const connection = new solanaWeb3.Connection("https://api.devnet.solana.com", {
  wsEndpoint: "wss://api.devnet.solana.com",
  commitment: "confirmed",
});

/**
 * 从本机 JSON 私钥文件读取钱包
 *
 * @param {string} path - 钱包文件路径
 * @returns {solanaWeb3.Keypair} 还原后的钱包对象
 */
function loadKeypair(path) {
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8")));

  return solanaWeb3.Keypair.fromSecretKey(secretKey);
}

/**
 * 简单等待函数
 *
 * @param {number} ms - 要等待的毫秒数
 * @returns {Promise<void>}
 *
 * 用途：
 * 有时候 Devnet / RPC 节点刚创建完账户，马上读取会有延迟
 * 所以我们可以稍微等一下再重试
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带重试机制地取得或创建 ATA（关联代币账户）
 *
 * 为什么要这样做？
 * 因为在 Devnet 上，有时候账户明明刚创建成功，
 * 但 RPC 节点短时间内还读不到，导致抛出 TokenAccountNotFoundError
 *
 * @param {solanaWeb3.Connection} connection - Solana 连接
 * @param {solanaWeb3.Keypair} payer - 付手续费的钱包
 * @param {solanaWeb3.PublicKey} mint - 代币 Mint 地址
 * @param {solanaWeb3.PublicKey} owner - ATA 的拥有者
 * @returns {Promise<any>} - ATA 账户对象
 */
async function getOrCreateAtaWithRetry(connection, payer, mint, owner) {
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await splToken.getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        owner,
        false, // allowOwnerOffCurve，这里 owner 是正常钱包公钥，不是 PDA，所以 false
        "confirmed",
        {
          commitment: "confirmed",
        },
      );
    } catch (error) {
      console.log(
        `第 ${attempt} 次创建 / 读取 ATA 失败：${error.name || error}`,
      );

      // 如果还没到最后一次，就等一下再试
      if (attempt < maxRetries) {
        console.log("等待 2 秒后重试...");
        await sleep(2000);
      } else {
        throw error;
      }
    }
  }
}

/**
 * 主函数：创建 SPL Token Mint，并铸造代币到自己的 ATA
 */
async function main() {
  // -----------------------------
  // 1) 读取主钱包
  // -----------------------------
  // 这个钱包会负责：
  // - 支付创建 mint / ATA / mintTo 的手续费
  // - 作为 mint authority（铸币权限）
  // - 接收新铸造出来的代币
  const walletKeyPair = loadKeypair("/Users/yichenlin/.config/solana/id.json");

  // 打印钱包地址
  console.log("主钱包地址 Wallet:", walletKeyPair.publicKey.toBase58());

  // 查询主钱包 SOL 余额
  const solBalance = await connection.getBalance(walletKeyPair.publicKey);
  console.log(
    "主钱包 SOL 余额:",
    solBalance / solanaWeb3.LAMPORTS_PER_SOL,
    "SOL",
  );

  // -----------------------------
  // 2) 创建新的 Token Mint
  // -----------------------------
  //
  // createMint(...) 会在链上创建一个新的 SPL Token mint
  //
  // 参数说明：
  // 1. connection                -> 链连接
  // 2. payer                     -> 谁付手续费
  // 3. mintAuthority             -> 谁能铸币
  // 4. freezeAuthority           -> 谁能冻结 token account
  // 5. decimals                  -> 小数位数
  // 6. keypair                   -> 可选，自定义 mint keypair
  // 7. confirmOptions            -> 可选，交易确认选项
  // 8. programId                 -> 使用哪个 token program
  //
  // 这里：
  // - mint authority = 你的钱包
  // - freeze authority = null（不设置冻结权限）
  // - decimals = 9
  const mint = await splToken.createMint(
    connection,
    walletKeyPair,
    walletKeyPair.publicKey,
    null,
    9,
    undefined,
    {
      commitment: "confirmed",
    },
    splToken.TOKEN_PROGRAM_ID,
  );

  console.log("新建 Token Mint 地址:", mint.toBase58());

  // 稍微等一下，避免刚创建 mint 后立刻读 ATA 时 RPC 还没同步
  await sleep(2000);

  // -----------------------------
  // 3) 为当前钱包创建 ATA（关联代币账户）
  // -----------------------------
  //
  // ATA = Associated Token Account
  // 表示“某个钱包持有某种 token 的标准账户”
  //
  // 这里我们使用带重试版本，增加 Devnet 成功率
  const tokenAccount = await getOrCreateAtaWithRetry(
    connection,
    walletKeyPair,
    mint,
    walletKeyPair.publicKey,
  );

  console.log("关联代币账户 ATA 地址:", tokenAccount.address.toBase58());

  // 再等一下，确保 ATA 状态已经稳定
  await sleep(2000);

  // -----------------------------
  // 4) 铸造代币到 ATA
  // -----------------------------
  //
  // mintTo(...) 会把指定数量代币铸造到目标 token account
  //
  // 这里 amount = 1000000000000
  // decimals = 9
  //
  // 实际人类可读数量：
  // 1000000000000 / 10^9 = 1000
  // 也就是铸造 1000 个 token
  const mintSignature = await splToken.mintTo(
    connection,
    walletKeyPair,
    mint,
    tokenAccount.address,
    walletKeyPair.publicKey,
    1000000000000,
    [],
    {
      commitment: "confirmed",
    },
  );

  console.log("铸造交易签名 MintTo signature:", mintSignature);

  // 稍微等一下，让 RPC 节点同步最新 token balance
  await sleep(2000);

  // -----------------------------
  // 5) 查询这个 ATA 的余额
  // -----------------------------
  const tokenBalance = await connection.getTokenAccountBalance(
    tokenAccount.address,
    "confirmed",
  );

  console.log("Token Account 原始余额:", tokenBalance.value.amount);
  console.log("Token 小数位数 decimals:", tokenBalance.value.decimals);
  console.log("Token 可读余额 uiAmount:", tokenBalance.value.uiAmount);
  console.log(
    "Token 可读余额 uiAmountString:",
    tokenBalance.value.uiAmountString,
  );

  // -----------------------------
  // 6) 总结输出
  // -----------------------------
  console.log("--------------------------------------------------");
  console.log("SPL Token 创建与铸造完成");
  console.log("Mint 地址:", mint.toBase58());
  console.log("ATA 地址:", tokenAccount.address.toBase58());
  console.log("你的钱包现在已经持有该代币。");
  console.log("--------------------------------------------------");
}

// 执行主函数
main().catch((error) => {
  console.error("程序执行出错：", error);
});
