const { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, SYSVAR_RENT_PUBKEY, clusterApiUrl } = solanaWeb3;

const PROGRAM_ID = new PublicKey("Fvhhzt6hCB1NjYe9MMKU5Jxq1xzYeod8FWFh3ptsNWK7");
const RPC_URL = clusterApiUrl("devnet");
const MAX_MESSAGE_LENGTH = 280;

const connection = new Connection(RPC_URL, "confirmed");

const connectButton = document.getElementById("connectButton");
const refreshButton = document.getElementById("refreshButton");
const submitButton = document.getElementById("submitButton");
const messageForm = document.getElementById("postForm");
const messageInput = document.getElementById("messageInput");
const walletMeta = document.getElementById("walletMeta");
const boardMeta = document.getElementById("boardMeta");
const boardList = document.getElementById("boardList");
const statusText = document.getElementById("statusText");
const faucetLink = document.getElementById("faucetLink");
const connectedCard = document.getElementById("connectedCard");
const connectedWallet = document.getElementById("connectedWallet");
const connectedPda = document.getElementById("connectedPda");
const connectedMessage = document.getElementById("connectedMessage");

let provider = null;
let currentPublicKey = null;


function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.dataset.state = isError ? "error" : "idle";
}


function shorten(value) {
  if (!value) return "";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}


function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


function getProvider() {
  const phantom = window.phantom?.solana;
  if (phantom?.isPhantom) {
    return phantom;
  }
  return null;
}


function derivePda(pubkey) {
  const [pda] = PublicKey.findProgramAddressSync([pubkey.toBytes()], PROGRAM_ID);
  return pda;
}


function createWriteInstruction(authority, messageText) {
  const payload = new TextEncoder().encode(messageText);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: derivePda(authority), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: payload,
  });
}


async function readMessageFromPda(pda) {
  const accountInfo = await connection.getAccountInfo(pda, "confirmed");
  if (!accountInfo?.data) {
    return null;
  }
  return new TextDecoder().decode(accountInfo.data);
}


async function refreshConnectedMessage() {
  if (!currentPublicKey) {
    connectedCard.hidden = true;
    return;
  }

  const pda = derivePda(currentPublicKey);
  connectedCard.hidden = false;
  connectedWallet.textContent = currentPublicKey.toBase58();
  connectedPda.textContent = pda.toBase58();

  try {
    const message = await readMessageFromPda(pda);
    connectedMessage.textContent = message || "这只钱包还没有链上留言。";
  } catch (error) {
    connectedMessage.textContent = `读取失败: ${error.message}`;
  }
}


function renderBoard(entries) {
  boardMeta.textContent = `RPC: ${RPC_URL} | Program: ${PROGRAM_ID.toBase58()} | Accounts: ${entries.length}`;

  if (!entries.length) {
    boardList.innerHTML = `<div class="empty">链上还没有可见留言。连上 Phantom 之后来发布第一条吧。</div>`;
    return;
  }

  boardList.innerHTML = entries
    .map((entry) => {
      return `
        <article class="entry">
          <div class="entry-top">
            <h3>${entry.isCurrentUser ? "你的留言" : "链上留言"}</h3>
            <span>${entry.isCurrentUser ? "当前钱包" : "Program Account"}</span>
          </div>
          <p class="meta">PDA: ${escapeHtml(entry.pda)}</p>
          <p class="meta">${entry.wallet ? `Wallet: ${escapeHtml(entry.wallet)}` : "Wallet: 当前无法从这份合约反推原钱包地址"}</p>
          <p class="message">${escapeHtml(entry.message || "")}</p>
        </article>
      `;
    })
    .join("");
}


async function refreshBoard() {
  const programAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
  });

  const entries = programAccounts
    .map((account) => ({
      pda: account.pubkey.toBase58(),
      message: new TextDecoder().decode(account.account.data),
      isCurrentUser: currentPublicKey ? derivePda(currentPublicKey).equals(account.pubkey) : false,
      wallet: null,
    }))
    .sort((left, right) => {
      if (left.isCurrentUser && !right.isCurrentUser) return -1;
      if (!left.isCurrentUser && right.isCurrentUser) return 1;
      return left.pda.localeCompare(right.pda);
    });

  renderBoard(entries);
}


async function connectWallet() {
  provider = getProvider();
  if (!provider) {
    throw new Error("没有检测到 Phantom。请先安装 Phantom 钱包扩展。");
  }

  const response = await provider.connect();
  currentPublicKey = response.publicKey;
  connectButton.textContent = `已连接 ${shorten(currentPublicKey.toBase58())}`;
  walletMeta.textContent = `Wallet: ${currentPublicKey.toBase58()} | PDA: ${derivePda(currentPublicKey).toBase58()}`;
  faucetLink.href = "https://faucet.solana.com/";
  await refreshConnectedMessage();
}


async function submitMessage(messageText) {
  if (!provider || !currentPublicKey) {
    throw new Error("请先连接 Phantom 钱包。");
  }

  const transaction = new Transaction().add(createWriteInstruction(currentPublicKey, messageText));
  transaction.feePayer = currentPublicKey;
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = latestBlockhash.blockhash;

  const result = await provider.signAndSendTransaction(transaction);
  await connection.confirmTransaction(
    {
      signature: result.signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed"
  );

  return result.signature;
}


connectButton.addEventListener("click", async () => {
  setStatus("正在连接 Phantom...");
  try {
    await connectWallet();
    await refreshBoard();
    setStatus("钱包已连接。你现在可以直接在浏览器里发 devnet 交易了。");
  } catch (error) {
    setStatus(error.message, true);
  }
});


refreshButton.addEventListener("click", async () => {
  setStatus("正在刷新链上留言板...");
  try {
    await refreshConnectedMessage();
    await refreshBoard();
    setStatus("链上留言板已刷新。");
  } catch (error) {
    setStatus(`刷新失败: ${error.message}`, true);
  }
});


messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const messageText = messageInput.value.trim();

  if (!messageText) {
    setStatus("请先输入留言内容。", true);
    return;
  }
  if (messageText.length > MAX_MESSAGE_LENGTH) {
    setStatus(`留言长度不能超过 ${MAX_MESSAGE_LENGTH} 个字符。`, true);
    return;
  }

  submitButton.disabled = true;
  setStatus("正在请求 Phantom 签名并提交到 devnet...");

  try {
    const signature = await submitMessage(messageText);
    messageInput.value = "";
    await refreshConnectedMessage();
    await refreshBoard();
    setStatus(`提交成功。交易签名: ${signature}`);
  } catch (error) {
    const message = error?.message || String(error);
    if (message.includes("User rejected")) {
      setStatus("你取消了 Phantom 签名。", true);
    } else {
      setStatus(`提交失败: ${message}`, true);
    }
  } finally {
    submitButton.disabled = false;
  }
});


window.addEventListener("load", async () => {
  provider = getProvider();

  if (!provider) {
    walletMeta.innerHTML = `没有检测到 Phantom。先安装钱包扩展，再回到这个页面。`;
    connectButton.textContent = "安装 Phantom 后再连接";
  } else {
    provider.on?.("connect", async (publicKey) => {
      currentPublicKey = publicKey;
      await refreshConnectedMessage();
      await refreshBoard();
    });

    provider.on?.("disconnect", () => {
      currentPublicKey = null;
      connectedCard.hidden = true;
      connectButton.textContent = "连接 Phantom";
      walletMeta.textContent = "连接钱包后，页面会显示你的地址、PDA 和当前链上留言。";
    });
  }

  try {
    if (provider?.isConnected && provider.publicKey) {
      currentPublicKey = provider.publicKey;
      connectButton.textContent = `已连接 ${shorten(currentPublicKey.toBase58())}`;
      walletMeta.textContent = `Wallet: ${currentPublicKey.toBase58()} | PDA: ${derivePda(currentPublicKey).toBase58()}`;
      await refreshConnectedMessage();
    }
    await refreshBoard();
    setStatus(`页面已就绪。若要发留言，请确保 Phantom 里的地址有 devnet SOL。`);
  } catch (error) {
    setStatus(`初始化失败: ${error.message}`, true);
  }
});
