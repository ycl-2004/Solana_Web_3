// 引入 Solana web3.js 主库
const solanaWeb3 = require("@solana/web3.js");

// 引入 Node.js 内建 fs 模块
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
 * 把 Keypair 存成 JSON 文件
 *
 * 说明：
 * stake account 虽然真正的管理权限会设给主钱包，
 * 但把新建的 stake account keypair 存下来，之后查资料会更方便。
 */
function saveKeypair(keypair, path) {
  fs.writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)));
}

/**
 * 等待函数
 *
 * 有时候 Devnet 状态同步会稍慢，
 * 两个步骤之间稍微停一下会更稳。
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // -----------------------------
  // 1) 读取主钱包
  // -----------------------------
  // 这个钱包会负责：
  // - 支付创建 stake account 的 SOL
  // - 支付交易手续费
  // - 作为 stake authority
  // - 作为 withdraw authority
  const walletKeyPair = loadKeypair("/Users/yichenlin/.config/solana/id.json");

  console.log("主钱包地址 Wallet:", walletKeyPair.publicKey.toBase58());

  const balance = await connection.getBalance(walletKeyPair.publicKey);
  console.log("主钱包 SOL 余额:", balance / solanaWeb3.LAMPORTS_PER_SOL, "SOL");

  // -----------------------------
  // 2) 指定你要委托的 validator votePubkey
  // -----------------------------
  // 你要先运行 find-devnet-vote-pubkeys.js，
  // 然后把其中一个 current votePubkey 贴到这里
  const votePubkey = new solanaWeb3.PublicKey(
    "B6kMs74PL2invrEmeyZSXiH4Rim3VmHRDJBuUcsNAoGE",
  );

  console.log("本次要委托的 votePubkey:", votePubkey.toBase58());

  // -----------------------------
  // 3) 生成 stake account
  // -----------------------------
  // 这是一个新的 stake account，不是普通收付款钱包
  // 它专门用来放要参与 staking 的 SOL
  const stakeAccount = solanaWeb3.Keypair.generate();

  // 把 stake account 存到当前项目目录，方便之后查
  const stakeAccountPath = "./stake-account.json";
  saveKeypair(stakeAccount, stakeAccountPath);

  console.log("新建 stake account 地址:", stakeAccount.publicKey.toBase58());
  console.log("stake account 已保存到:", stakeAccountPath);

  // -----------------------------
  // 4) 创建 stake account 的指令
  // -----------------------------
  //
  // fromPubkey:
  //   由谁出钱创建 stake account
  //
  // stakePubkey:
  //   新 stake account 的地址
  //
  // authorized:
  //   设置两个权限：
  //   - staker authority
  //   - withdraw authority
  //
  // 这里我们都设成主钱包，所以以后：
  // - 你可以重新 delegate
  // - 你可以把 stake withdraw 回来
  //
  // lamports:
  //   放入多少 SOL 到这个 stake account
  //   这里用 0.01 SOL 做练习
  const createStakeAccountInstruction = solanaWeb3.StakeProgram.createAccount({
    fromPubkey: walletKeyPair.publicKey,
    stakePubkey: stakeAccount.publicKey,
    authorized: new solanaWeb3.Authorized(
      walletKeyPair.publicKey, // staker authority
      walletKeyPair.publicKey, // withdraw authority
    ),
    lamports: solanaWeb3.LAMPORTS_PER_SOL * 0.01,
  });

  // -----------------------------
  // 5) 发送创建 stake account 的交易
  // -----------------------------
  // 这里直接用 sendAndConfirmTransaction 即可
  //
  // 需要两个签名者：
  // - walletKeyPair：主钱包在出钱
  // - stakeAccount：新账户本身需要签名完成创建
  const createStakeTx = new solanaWeb3.Transaction().add(
    createStakeAccountInstruction,
  );

  const createStakeSignature = await solanaWeb3.sendAndConfirmTransaction(
    connection,
    createStakeTx,
    [walletKeyPair, stakeAccount],
  );

  console.log("创建 stake account 交易签名:", createStakeSignature);

  // 稍等一下，让链上状态更稳定
  await sleep(2000);

  // -----------------------------
  // 6) 构建 delegate 指令
  // -----------------------------
  //
  // stakePubkey:
  //   哪个 stake account 要被委托
  //
  // authorizedPubkey:
  //   谁有权限发出这次 delegate
  //
  // votePubkey:
  //   要委托给哪个 validator 的 vote account
  const delegateInstruction = solanaWeb3.StakeProgram.delegate({
    stakePubkey: stakeAccount.publicKey,
    authorizedPubkey: walletKeyPair.publicKey,
    votePubkey: votePubkey,
  });

  // -----------------------------
  // 7) 发送 delegate 交易
  // -----------------------------
  // 这里只需要主钱包签名，因为 delegate 权限在主钱包
  const delegateTx = new solanaWeb3.Transaction().add(delegateInstruction);

  const delegateSignature = await solanaWeb3.sendAndConfirmTransaction(
    connection,
    delegateTx,
    [walletKeyPair],
  );

  console.log("Delegate 交易签名:", delegateSignature);

  // 稍等一下
  await sleep(2000);

  // -----------------------------
  // 8) 读取 stake account 状态
  // -----------------------------
  // 查询 stake account 的链上信息
  const stakeAccountInfo = await connection.getParsedAccountInfo(
    stakeAccount.publicKey,
    "confirmed",
  );

  console.log("--------------------------------------------------");
  console.log("Delegate / 质押 SOL 测试完成");
  console.log("主钱包:", walletKeyPair.publicKey.toBase58());
  console.log("Stake Account:", stakeAccount.publicKey.toBase58());
  console.log("Vote Pubkey:", votePubkey.toBase58());
  console.log("Stake Account 已保存到:", stakeAccountPath);
  console.log("创建 stake 签名:", createStakeSignature);
  console.log("Delegate 签名:", delegateSignature);
  console.log("Stake Account 链上信息:");
  console.dir(stakeAccountInfo.value, { depth: 6 });
  console.log("--------------------------------------------------");
}

main().catch((error) => {
  console.error("程序执行出错：", error);
});
