// 引入 Solana 的 web3.js 主库
// 这个库是 Solana JavaScript 开发最核心的工具库，常用于：
// 1. 连接 Solana 网络
// 2. 读取钱包
// 3. 查询余额
// 4. 建立并发送交易
const solanaWeb3 = require("@solana/web3.js");

// 引入 Node.js 内建的 fs（file system）模块
// 用来读取本机上的文件，例如 Solana CLI 生成的钱包文件 id.json
const fs = require("fs");

// 建立到 Solana Devnet 的连接
// 这里使用 Solana 官方提供的 Devnet RPC 节点
// - https://api.devnet.solana.com 负责一般 HTTP 请求
// - wss://api.devnet.solana.com 负责 WebSocket 连接（订阅 / 即时更新等功能）
//
// Devnet 是测试网：
// - 适合学习、开发、调试
// - 里面的 SOL 不是主网真钱
const connection = new solanaWeb3.Connection("https://api.devnet.solana.com", {
  wsEndpoint: "wss://api.devnet.solana.com",
});

// 主函数
// 因为我们要执行网络请求（例如 getBalance），所以用 async function
async function main() {
  // 读取本机上的 Solana 钱包私钥文件
  //
  // /Users/yichenlin/.config/solana/id.json
  // 这是 Solana CLI 默认钱包的常见路径
  //
  // 这个文件通常存的是一个数字数组，例如：
  // [12, 34, 56, ...]
  //
  // 它本质上是 secret key 的原始字节资料
  const secretKey = Uint8Array.from(
    JSON.parse(
      fs.readFileSync("/Users/yichenlin/.config/solana/id.json", "utf8"),
    ),
  );

  // 用 secret key 还原出 Keypair 钱包对象
  //
  // Keypair 里面包含：
  // - publicKey：公开地址（钱包地址）
  // - secret key：私钥资料（用于签名）
  //
  // 以后如果要发交易、签名、转账，都会用到这个钱包对象
  const walletKeyPair = solanaWeb3.Keypair.fromSecretKey(secretKey);

  // 打印钱包地址
  //
  // publicKey 是一个 PublicKey 对象
  // toBase58() 会把它转换成我们平常看到的 Solana 钱包地址字串
  console.log("Wallet address:", walletKeyPair.publicKey.toBase58());

  // 查询这个钱包地址在链上的余额
  //
  // getBalance(...) 回传的单位不是 SOL，而是 lamports
  // lamports 是 SOL 的最小单位
  //
  // 换算关系：
  // 1 SOL = 1,000,000,000 lamports
  const balance = await connection.getBalance(walletKeyPair.publicKey);

  // 把 lamports 转换成 SOL 后印出来
  //
  // solanaWeb3.LAMPORTS_PER_SOL = 1_000_000_000
  // 所以用 balance / solanaWeb3.LAMPORTS_PER_SOL
  // 就能得到我们平常比较熟悉的 SOL 数值
  console.log("Balance:", balance / solanaWeb3.LAMPORTS_PER_SOL, "SOL");
}

// 执行主函数
//
// .catch(console.error) 的意思是：
// 如果 main() 执行过程中发生错误，就把错误印出来
//
// 常见错误可能包括：
// - 钱包文件路径写错
// - JSON 格式有问题
// - 网络连不上 Devnet
// - RPC 请求失败
main().catch(console.error);
