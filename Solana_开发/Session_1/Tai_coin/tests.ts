import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  SendTransactionError,
} from "@solana/web3.js";
import fs from "fs";
import assert from "assert";

const PROGRAM_ID = new PublicKey(
  "39ZdSUczSnnbYM3zCcMJWScqRZ8TCTTx7SDVANd5BTuv",
);
const RPC_URL = "http://127.0.0.1:8899";

function loadKeypair(path: string): Keypair {
  const secret = JSON.parse(fs.readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function u64Be(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(n);
  return buf;
}

function section(title: string) {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

function sub(label: string, value: unknown) {
  console.log(`${label}:`, value);
}

function pass(msg: string) {
  console.log(`✅ ${msg}`);
}

function fail(msg: string) {
  console.log(`❌ ${msg}`);
}

function fmtBig(n: bigint) {
  return n.toString();
}

async function airdropIfNeeded(
  connection: Connection,
  pubkey: PublicKey,
  minLamports = LAMPORTS_PER_SOL,
) {
  const bal = await connection.getBalance(pubkey);
  if (bal >= minLamports) return;

  const sig = await connection.requestAirdrop(pubkey, minLamports);
  await connection.confirmTransaction(sig, "confirmed");
}

function derivePda(owner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [owner.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

async function getTokenBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<bigint> {
  const pda = derivePda(owner);
  const acc = await connection.getAccountInfo(pda);
  if (!acc) return 0n;
  return acc.data.readBigUInt64BE(0);
}

async function mint(
  connection: Connection,
  user: Keypair,
  amount: bigint,
): Promise<string> {
  const userPda = derivePda(user.publicKey);
  const data = Buffer.concat([Buffer.from([0x00]), u64Be(amount)]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user.publicKey, isSigner: true, isWritable: true },
      { pubkey: userPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  return await sendAndConfirmTransaction(connection, tx, [user]);
}

async function transfer(
  connection: Connection,
  from: Keypair,
  to: PublicKey,
  amount: bigint,
): Promise<string> {
  const fromPda = derivePda(from.publicKey);
  const toPda = derivePda(to);
  const data = Buffer.concat([Buffer.from([0x01]), u64Be(amount)]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: from.publicKey, isSigner: true, isWritable: true },
      { pubkey: fromPda, isSigner: false, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
      { pubkey: toPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  return await sendAndConfirmTransaction(connection, tx, [from]);
}

async function expectThrowsDetailed(
  connection: Connection,
  fn: () => Promise<unknown>,
  label: string,
) {
  try {
    await fn();
    throw new Error(`测试 ${label} 预期失败，但实际上成功了`);
  } catch (err: unknown) {
    pass(`${label}：如预期失败`);

    if (err instanceof SendTransactionError) {
      sub("错误类型", "SendTransactionError");
      sub("错误讯息", err.message);
      try {
        const logs = await err.getLogs(connection);
        if (logs?.length) {
          console.log("程序日志:");
          for (const line of logs) {
            console.log("  " + line);
          }
        }
      } catch {
        sub("程序日志", "无法额外读取 logs");
      }
    } else {
      sub("错误讯息", String(err));
    }
  }
}

async function testMintOnce(connection: Connection, user: Keypair) {
  section("Test 1: 单次 mint 测试");

  const amount = 100n;
  const before = await getTokenBalance(connection, user.publicKey);
  const expectedAfter = before + amount;

  sub("测试目的", "验证 mint 指令可成功执行，且余额正确增加");
  sub("输入 amount", fmtBig(amount));
  sub("发送者地址", user.publicKey.toBase58());
  sub("发送者 PDA", derivePda(user.publicKey).toBase58());
  sub("前置余额 before", fmtBig(before));
  sub("预期结果 expectedAfter", fmtBig(expectedAfter));

  const sig = await mint(connection, user, amount);
  const after = await getTokenBalance(connection, user.publicKey);

  sub("交易签名", sig);
  sub("实际结果 actualAfter", fmtBig(after));

  assert.equal(after, expectedAfter, "mint 后余额应该等于 before + amount");
  pass("Test 1 passed");
}

async function testTransferSuccess(connection: Connection, user: Keypair) {
  section("Test 2: 正常 transfer 测试");

  const receiver = Keypair.generate();
  const amount = 30n;

  await airdropIfNeeded(connection, receiver.publicKey);

  const userBefore = await getTokenBalance(connection, user.publicKey);
  const receiverBefore = await getTokenBalance(connection, receiver.publicKey);
  const expectedUserAfter = userBefore - amount;
  const expectedReceiverAfter = receiverBefore + amount;

  sub("测试目的", "验证 transfer 指令可成功执行，且双方余额变化正确");
  sub("输入 amount", fmtBig(amount));
  sub("发送者地址", user.publicKey.toBase58());
  sub("发送者 PDA", derivePda(user.publicKey).toBase58());
  sub("接收者地址", receiver.publicKey.toBase58());
  sub("接收者 PDA", derivePda(receiver.publicKey).toBase58());
  sub("发送者初始余额", fmtBig(userBefore));
  sub("接收者初始余额", fmtBig(receiverBefore));
  sub("预期发送者余额", fmtBig(expectedUserAfter));
  sub("预期接收者余额", fmtBig(expectedReceiverAfter));

  const sig = await transfer(connection, user, receiver.publicKey, amount);

  const userAfter = await getTokenBalance(connection, user.publicKey);
  const receiverAfter = await getTokenBalance(connection, receiver.publicKey);

  sub("交易签名", sig);
  sub("实际发送者余额", fmtBig(userAfter));
  sub("实际接收者余额", fmtBig(receiverAfter));

  assert.equal(userAfter, expectedUserAfter, "发送者余额错误");
  assert.equal(receiverAfter, expectedReceiverAfter, "接收者余额错误");

  pass("Test 2 passed");
}

async function testInsufficientBalance(connection: Connection) {
  section("Test 3: 余额不足 transfer 应失败");

  const poorUser = Keypair.generate();
  const receiver = Keypair.generate();
  const amount = 1n;

  await airdropIfNeeded(connection, poorUser.publicKey);
  await airdropIfNeeded(connection, receiver.publicKey);

  const poorBefore = await getTokenBalance(connection, poorUser.publicKey);
  const receiverBefore = await getTokenBalance(connection, receiver.publicKey);

  sub("测试目的", "验证余额不足时，transfer 不应成功");
  sub("输入 amount", fmtBig(amount));
  sub("发送者地址", poorUser.publicKey.toBase58());
  sub("发送者 PDA", derivePda(poorUser.publicKey).toBase58());
  sub("接收者地址", receiver.publicKey.toBase58());
  sub("接收者 PDA", derivePda(receiver.publicKey).toBase58());
  sub("发送者初始余额", fmtBig(poorBefore));
  sub("接收者初始余额", fmtBig(receiverBefore));
  sub("预期结果", "交易失败，双方余额保持不变");

  assert.equal(poorBefore, 0n, "新发送者的 token 初始余额应该是 0");

  await expectThrowsDetailed(
    connection,
    async () => {
      await transfer(connection, poorUser, receiver.publicKey, amount);
    },
    "余额不足转账",
  );

  const poorAfter = await getTokenBalance(connection, poorUser.publicKey);
  const receiverAfter = await getTokenBalance(connection, receiver.publicKey);

  sub("实际发送者余额", fmtBig(poorAfter));
  sub("实际接收者余额", fmtBig(receiverAfter));

  assert.equal(poorAfter, 0n, "失败后发送者余额应保持 0");
  assert.equal(receiverAfter, 0n, "失败后接收者余额应保持 0");

  pass("Test 3 passed");
}

async function testMintAccumulates(connection: Connection, user: Keypair) {
  section("Test 4: 连续 mint 累加测试");

  const amount1 = 50n;
  const amount2 = 25n;
  const before = await getTokenBalance(connection, user.publicKey);
  const expectedAfter = before + amount1 + amount2;

  sub("测试目的", "验证连续两次 mint 会正确累加余额");
  sub("第一次 mint", fmtBig(amount1));
  sub("第二次 mint", fmtBig(amount2));
  sub("发送者地址", user.publicKey.toBase58());
  sub("发送者 PDA", derivePda(user.publicKey).toBase58());
  sub("初始余额", fmtBig(before));
  sub("预期最终余额", fmtBig(expectedAfter));

  const sig1 = await mint(connection, user, amount1);
  const sig2 = await mint(connection, user, amount2);
  const after = await getTokenBalance(connection, user.publicKey);

  sub("第一次交易签名", sig1);
  sub("第二次交易签名", sig2);
  sub("实际最终余额", fmtBig(after));

  assert.equal(after, expectedAfter, "连续 mint 后余额不正确");
  pass("Test 4 passed");
}

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const user = loadKeypair(process.env.HOME + "/.config/solana/id.json");

  section("测试环境信息");
  sub("RPC", RPC_URL);
  sub("Program ID", PROGRAM_ID.toBase58());
  sub("测试钱包", user.publicKey.toBase58());
  sub("测试钱包 PDA", derivePda(user.publicKey).toBase58());
  sub("说明", "请确保本地 validator 已启动，且 program 已部署");
  sub("说明", "若 mint 有白名单限制，目前钱包地址必须与合约中写死地址一致");

  await airdropIfNeeded(connection, user.publicKey);

  await testMintOnce(connection, user);
  await testTransferSuccess(connection, user);
  await testInsufficientBalance(connection);
  await testMintAccumulates(connection, user);

  section("测试总结");
  pass("全部测试通过");
}

main().catch((err) => {
  section("测试失败");
  fail("测试执行中断");
  console.error(err);
  process.exit(1);
});
