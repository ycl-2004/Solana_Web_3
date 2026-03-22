// 引入 Solana 的 web3.js 主库
// 这个库负责：连接 Solana、读取钱包、建立交易、发送交易等
const solanaWeb3 = require("@solana/web3.js");

// 引入 Node.js 内建的 fs（file system）模块
// 用来读取本机上的钱包 JSON 文件，例如 id.json / second-wallet.json
const fs = require("fs");

// 建立到 Solana Devnet 的连接
// - 第一个参数是 HTTP RPC 端点，用于一般请求
// - wsEndpoint 是 WebSocket 端点，某些订阅 / 即时功能会用到
// Devnet 是测试网，不是真实主网资金，适合练习
const connection = new solanaWeb3.Connection("https://api.devnet.solana.com", {
  wsEndpoint: "wss://api.devnet.solana.com",
});

/**
 * 从本机的 JSON 私钥文件加载钱包
 *
 * @param {string} path - 钱包 JSON 文件路径
 * @returns {solanaWeb3.Keypair} - 还原后的 Keypair 钱包对象
 *
 * 说明：
 * Solana CLI 生成的钱包文件，通常长这样：
 * [
 *   12, 34, 56, ...
 * ]
 *
 * 它本质上是一串 secret key 的数字数组。
 * 这里我们做的事情是：
 * 1. 读取 JSON 文件内容
 * 2. 把 JSON 数组转成 Uint8Array
 * 3. 交给 Keypair.fromSecretKey(...) 还原成真正的钱包对象
 */
function loadKeypair(path) {
  // 读取文件内容（utf8 字串）
  const fileContent = fs.readFileSync(path, "utf8");

  // 把 JSON 字串解析成 JavaScript 数组
  const secretKeyArray = JSON.parse(fileContent);

  // 把普通数组转成 Uint8Array
  // Keypair.fromSecretKey(...) 需要的是 Uint8Array 格式
  const secretKey = Uint8Array.from(secretKeyArray);

  // 用 secret key 还原钱包
  return solanaWeb3.Keypair.fromSecretKey(secretKey);
}

/**
 * 主函数：执行整笔转账流程
 *
 * 整个流程如下：
 * 1. 读取发送方钱包
 * 2. 读取接收方钱包
 * 3. 查询转账前余额
 * 4. 组装一笔 System Program 转账交易
 * 5. 发送并确认交易
 * 6. 查询转账后余额
 * 7. 输出交易签名与结果
 */
async function main() {
  // -----------------------------
  // 1) 读取发送方钱包
  // -----------------------------
  // 这里使用你 Solana CLI 默认钱包：
  // /Users/yichenlin/.config/solana/id.json
  // 这个钱包会负责：
  // - 作为转账发起者
  // - 支付转出的 SOL
  // - 支付交易手续费
  const sender = loadKeypair("/Users/yichenlin/.config/solana/id.json");

  // -----------------------------
  // 2) 读取接收方钱包
  // -----------------------------
  // 这里读取你另外一个钱包：
  // /Users/yichenlin/second-wallet.json
  // 这个钱包不会签名，因为它只是收款方
  const receiver = loadKeypair("/Users/yichenlin/second-wallet.json");

  // 打印发送方与接收方地址（public key）
  // toBase58() 会把公钥转成人类平常看到的钱包地址字串
  console.log("发送方地址 Sender:", sender.publicKey.toBase58());
  console.log("接收方地址 Receiver:", receiver.publicKey.toBase58());

  // -----------------------------
  // 3) 查询转账前余额
  // -----------------------------
  // getBalance(...) 回传的是 lamports，不是 SOL
  // 1 SOL = 1,000,000,000 lamports
  const beforeSender = await connection.getBalance(sender.publicKey);
  const beforeReceiver = await connection.getBalance(receiver.publicKey);

  // 把 lamports 转成 SOL，方便阅读
  console.log(
    "转账前 Sender 余额:",
    beforeSender / solanaWeb3.LAMPORTS_PER_SOL,
    "SOL",
  );
  console.log(
    "转账前 Receiver 余额:",
    beforeReceiver / solanaWeb3.LAMPORTS_PER_SOL,
    "SOL",
  );

  // -----------------------------
  // 4) 建立转账交易
  // -----------------------------
  // new Transaction()：建立一笔新的交易对象
  // .add(...)：往交易里添加一条 instruction（指令）
  //
  // 这里添加的是 System Program 的 transfer instruction
  // 表示：把 sender 的 lamports 转给 receiver
  const transaction = new solanaWeb3.Transaction().add(
    solanaWeb3.SystemProgram.transfer({
      // 转出方公钥
      fromPubkey: sender.publicKey,

      // 收款方公钥
      toPubkey: receiver.publicKey,

      // 转账金额（单位是 lamports）
      // 这里是 0.001 SOL
      lamports: 0.001 * solanaWeb3.LAMPORTS_PER_SOL,
    }),
  );

  // -----------------------------
  // 5) 发送并确认交易
  // -----------------------------
  // sendAndConfirmTransaction(...) 会帮你做这些事情：
  // 1. 自动补最近区块哈希
  // 2. 让需要签名的钱包签名
  // 3. 发送到网络
  // 4. 等待网络确认交易成功
  //
  // 参数说明：
  // - connection：和哪条链连接
  // - transaction：要送出的交易
  // - [sender]：签名者列表
  //
  // 这里只有 sender 要签名，因为钱是从 sender 转出去的
  const signature = await solanaWeb3.sendAndConfirmTransaction(
    connection,
    transaction,
    [sender],
  );

  // 打印交易签名
  // 你可以把这串 signature 拿去 Solana Explorer（切到 Devnet）查询
  console.log("交易签名 Transaction signature:", signature);

  // -----------------------------
  // 6) 查询转账后余额
  // -----------------------------
  const afterSender = await connection.getBalance(sender.publicKey);
  const afterReceiver = await connection.getBalance(receiver.publicKey);

  // 输出转账后余额
  console.log(
    "转账后 Sender 余额:",
    afterSender / solanaWeb3.LAMPORTS_PER_SOL,
    "SOL",
  );
  console.log(
    "转账后 Receiver 余额:",
    afterReceiver / solanaWeb3.LAMPORTS_PER_SOL,
    "SOL",
  );

  // -----------------------------
  // 7) 额外说明
  // -----------------------------
  // 你会发现：
  // - Receiver 的余额大约增加 0.001 SOL
  // - Sender 的余额会减少：
  //   0.001 SOL + 一点点交易手续费
  //
  // 所以 Sender 的实际减少量通常会比 0.001 SOL 稍微多一点点
}

// 执行主函数
// 如果过程中有任何错误（例如网络问题、余额不足、路径错误）
// 就会被 catch 到并打印出来
main().catch((error) => {
  console.error("程序执行出错：", error);
});
