const solanaWeb3 = require("@solana/web3.js");

// 连接 Devnet
const connection = new solanaWeb3.Connection("https://api.devnet.solana.com", {
  wsEndpoint: "wss://api.devnet.solana.com",
  commitment: "confirmed",
});

async function main() {
  // 读取当前可见的 vote accounts
  // 官方 RPC 方法叫 getVoteAccounts
  const voteAccounts = await connection.getVoteAccounts();

  console.log("===== Current vote accounts on Devnet =====");

  // 只先列 current，通常比较适合拿来测试 delegate
  voteAccounts.current.slice(0, 10).forEach((account, index) => {
    console.log(`\n[${index + 1}]`);
    console.log("votePubkey:", account.votePubkey);
    console.log("nodePubkey:", account.nodePubkey);
    console.log("activatedStake:", account.activatedStake);
    console.log("commission:", account.commission);
  });

  console.log("\n总 current 数量:", voteAccounts.current.length);
  console.log("总 delinquent 数量:", voteAccounts.delinquent.length);

  if (voteAccounts.current.length > 0) {
    console.log("\n你可以先拿第一个 current votePubkey 来测试：");
    console.log(voteAccounts.current[0].votePubkey);
  }
}

main().catch(console.error);
