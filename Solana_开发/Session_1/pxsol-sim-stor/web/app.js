const { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, SYSVAR_RENT_PUBKEY, clusterApiUrl } = solanaWeb3;

const PROGRAM_ID = new PublicKey("Fvhhzt6hCB1NjYe9MMKU5Jxq1xzYeod8FWFh3ptsNWK7");
const RPC_URL = clusterApiUrl("devnet");
const MAX_MESSAGE_LENGTH = 280;
const DEFAULT_LANG = "zh";

const messages = {
  zh: {
    document_title: "Phantom Devnet 留言板",
    eyebrow: "Phantom + Devnet",
    hero_title: "把当前项目直接变成 GitHub 可部署的前端留言板",
    hero_intro: "这个版本不再读取本地私钥文件，也不需要 Python server。网页会直接连接 Phantom，由用户自己签名交易并写入你现有的 Solana 程序。",
    side_label: "当前设置",
    side_network: "网络",
    side_wallet_mode: "钱包模式",
    side_wallet_value: "Phantom 签名",
    side_storage_mode: "存储方式",
    side_storage_value: "每个钱包只保留一条最新留言",
    wallet_title: "连接钱包",
    wallet_subtitle: "先连接 Phantom，再读取或写入你的链上留言。",
    connect_button: "连接 Phantom",
    wallet_meta_default: "连接钱包后，页面会显示你的地址、PDA 和当前链上留言。",
    wallet_hint_prefix: "连接钱包不需要余额；真正发留言时，需要一点点",
    wallet_hint_suffix: "没有测试币的话，可以到",
    wallet_hint_end: "领取。",
    current_wallet_title: "当前钱包",
    current_wallet_subtitle: "这里只展示你当前连接地址对应的链上留言。",
    current_wallet_badge: "一钱包一条最新留言",
    surface_label: "当前内容",
    composer_title: "发布留言",
    composer_subtitle: "输入新内容并签名提交；它会覆盖这个钱包之前那条留言。",
    refresh_button: "刷新链上留言板",
    message_label: "本次留言",
    message_placeholder: "写点什么上链吧。提交后会覆盖你这个钱包之前的留言。",
    submit_button: "用 Phantom 提交到 Devnet",
    composer_hint: "这份合约当前没有“追加多条留言”的能力，所以你每次发新内容时，都会覆盖自己上一条链上留言。",
    status_label: "状态",
    board_title: "链上留言板",
    legend_current: "当前钱包会排在最前",
    board_note: "留言板直接读取当前 program 下面的所有链上账户。因为合约没有存作者昵称或时间戳，所以这里只能稳定显示 PDA 和消息内容。",
    board_meta: "RPC: {rpc} | Program: {program} | Accounts: {count}",
    empty_board: "链上还没有可见留言。连上 Phantom 之后来发布第一条吧。",
    your_message: "你的留言",
    board_message: "链上留言",
    current_wallet_tag: "当前钱包",
    account_tag: "Program Account",
    wallet_unknown: "Wallet: 当前无法从这份合约反推原钱包地址",
    wallet_label: "Wallet",
    pda_label: "PDA",
    no_message_yet: "这只钱包还没有链上留言。",
    read_failed: "读取失败: {error}",
    phantom_missing: "没有检测到 Phantom。请先安装 Phantom 钱包扩展。",
    install_phantom: "安装 Phantom 后再连接",
    connect_loading: "正在连接 Phantom...",
    connected_status: "钱包已连接。你现在可以直接在浏览器里发 devnet 交易了。",
    refresh_loading: "正在刷新链上留言板...",
    refresh_done: "链上留言板已刷新。",
    refresh_failed: "刷新失败: {error}",
    input_empty: "请先输入留言内容。",
    input_too_long: "留言长度不能超过 {max} 个字符。",
    submit_loading: "正在请求 Phantom 签名并提交到 devnet...",
    submit_success: "提交成功。交易签名: {signature}",
    submit_cancelled: "你取消了 Phantom 签名。",
    submit_failed: "提交失败: {error}",
    init_ready: "页面已就绪。若要发留言，请确保 Phantom 里的地址有 devnet SOL。",
    init_failed: "初始化失败: {error}",
    disconnected_wallet_meta: "连接钱包后，页面会显示你的地址、PDA 和当前链上留言。"
  },
  en: {
    document_title: "Phantom Devnet Message Board",
    eyebrow: "Phantom + Devnet",
    hero_title: "Turn this project into a GitHub-deployable front-end message board",
    hero_intro: "This version no longer reads local keypair files and does not need a Python server. The page connects directly to Phantom, and each user signs their own transaction into your existing Solana program.",
    side_label: "Current Setup",
    side_network: "Network",
    side_wallet_mode: "Wallet Mode",
    side_wallet_value: "Phantom Sign",
    side_storage_mode: "Storage",
    side_storage_value: "One latest message per wallet",
    wallet_title: "Connect Wallet",
    wallet_subtitle: "Connect Phantom first, then read or write your on-chain message.",
    connect_button: "Connect Phantom",
    wallet_meta_default: "After connecting, the page will show your wallet address, PDA, and current on-chain message.",
    wallet_hint_prefix: "Connecting a wallet does not require balance; posting a message requires a little",
    wallet_hint_suffix: "If you do not have test SOL yet, get some from",
    wallet_hint_end: ".",
    current_wallet_title: "Current Wallet",
    current_wallet_subtitle: "This section only shows the message for the wallet you have connected right now.",
    current_wallet_badge: "One latest message per wallet",
    surface_label: "Current Message",
    composer_title: "Post Message",
    composer_subtitle: "Type a new message and sign it; it will replace the previous message for this wallet.",
    refresh_button: "Refresh Board",
    message_label: "Message",
    message_placeholder: "Write something on-chain. Submitting will replace the previous message for this wallet.",
    submit_button: "Submit with Phantom to Devnet",
    composer_hint: "This contract does not support appending multiple messages yet, so each new submission replaces the previous on-chain message for the same wallet.",
    status_label: "Status",
    board_title: "On-Chain Board",
    legend_current: "Your current wallet stays pinned to the top",
    board_note: "The board reads every account owned by the current program. Because the contract does not store author names or timestamps, the UI can only reliably show the PDA and message content.",
    board_meta: "RPC: {rpc} | Program: {program} | Accounts: {count}",
    empty_board: "No visible on-chain messages yet. Connect Phantom and publish the first one.",
    your_message: "Your Message",
    board_message: "On-Chain Message",
    current_wallet_tag: "Current Wallet",
    account_tag: "Program Account",
    wallet_unknown: "Wallet: the original wallet address cannot be derived from this contract",
    wallet_label: "Wallet",
    pda_label: "PDA",
    no_message_yet: "This wallet has not posted an on-chain message yet.",
    read_failed: "Read failed: {error}",
    phantom_missing: "Phantom was not detected. Please install the Phantom extension first.",
    install_phantom: "Install Phantom to connect",
    connect_loading: "Connecting to Phantom...",
    connected_status: "Wallet connected. You can now send devnet transactions directly from the browser.",
    refresh_loading: "Refreshing the on-chain board...",
    refresh_done: "The on-chain board has been refreshed.",
    refresh_failed: "Refresh failed: {error}",
    input_empty: "Please enter a message first.",
    input_too_long: "Messages cannot exceed {max} characters.",
    submit_loading: "Requesting Phantom signature and submitting to devnet...",
    submit_success: "Submitted successfully. Signature: {signature}",
    submit_cancelled: "You cancelled the Phantom signature request.",
    submit_failed: "Submit failed: {error}",
    init_ready: "Page ready. To post a message, make sure your Phantom wallet has some devnet SOL.",
    init_failed: "Initialization failed: {error}",
    disconnected_wallet_meta: "After connecting, the page will show your wallet address, PDA, and current on-chain message."
  }
};

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
const languageToggle = document.getElementById("languageToggle");
const charCount = document.getElementById("charCount");

let provider = null;
let currentPublicKey = null;
let currentLang = localStorage.getItem("pxsol-lang") || DEFAULT_LANG;
let lastStatus = { key: "init_ready", params: {}, isError: false };

function t(key, params = {}) {
  const table = messages[currentLang] || messages[DEFAULT_LANG];
  let template = table[key] || messages[DEFAULT_LANG][key] || key;
  for (const [paramKey, value] of Object.entries(params)) {
    template = template.replaceAll(`{${paramKey}}`, value);
  }
  return template;
}

function applyTranslations() {
  document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
  document.title = t("document_title");
  languageToggle.textContent = currentLang === "zh" ? "EN" : "中";

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });

  updateConnectButton();
  updateWalletMeta();

  renderStatus();
}

function setStatus(key, params = {}, isError = false) {
  lastStatus = { key, params, isError };
  renderStatus();
}

function renderStatus() {
  statusText.textContent = t(lastStatus.key, lastStatus.params);
  statusText.dataset.state = lastStatus.isError ? "error" : "idle";
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
  return phantom?.isPhantom ? phantom : null;
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

function renderCharCount() {
  charCount.textContent = String(messageInput.value.length);
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
    connectedMessage.textContent = message || t("no_message_yet");
  } catch (error) {
    connectedMessage.textContent = t("read_failed", { error: error.message });
  }
}

function renderBoard(entries) {
  boardMeta.textContent = t("board_meta", {
    rpc: RPC_URL,
    program: PROGRAM_ID.toBase58(),
    count: entries.length
  });

  if (!entries.length) {
    boardList.innerHTML = `<div class="empty">${escapeHtml(t("empty_board"))}</div>`;
    return;
  }

  boardList.innerHTML = entries
    .map((entry) => {
      return `
        <article class="entry ${entry.isCurrentUser ? "entry-current" : ""}">
          <div class="entry-top">
            <div class="entry-heading">
              <h3>${entry.isCurrentUser ? t("your_message") : t("board_message")}</h3>
              <span class="entry-tag">${entry.isCurrentUser ? t("current_wallet_tag") : t("account_tag")}</span>
            </div>
          </div>
          <div class="entry-grid">
            <p class="meta"><span class="meta-label">${t("pda_label")}:</span> ${escapeHtml(entry.pda)}</p>
            <p class="meta"><span class="meta-label">${t("wallet_label")}:</span> ${entry.wallet ? escapeHtml(entry.wallet) : escapeHtml(t("wallet_unknown").replace(/^Wallet:\s*/, ""))}</p>
          </div>
          <p class="message">${escapeHtml(entry.message || "")}</p>
        </article>
      `;
    })
    .join("");
}

async function refreshBoard() {
  const programAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed"
  });

  const entries = programAccounts
    .map((account) => ({
      pda: account.pubkey.toBase58(),
      message: new TextDecoder().decode(account.account.data),
      isCurrentUser: currentPublicKey ? derivePda(currentPublicKey).equals(account.pubkey) : false,
      wallet: null
    }))
    .sort((left, right) => {
      if (left.isCurrentUser && !right.isCurrentUser) return -1;
      if (!left.isCurrentUser && right.isCurrentUser) return 1;
      return left.pda.localeCompare(right.pda);
    });

  renderBoard(entries);
}

function updateWalletMeta() {
  if (!currentPublicKey) {
    walletMeta.textContent = provider ? t("disconnected_wallet_meta") : t("phantom_missing");
    return;
  }
  walletMeta.textContent = `Wallet: ${currentPublicKey.toBase58()} | PDA: ${derivePda(currentPublicKey).toBase58()}`;
}

function updateConnectButton() {
  if (!provider) {
    connectButton.textContent = t("install_phantom");
    return;
  }
  if (!currentPublicKey) {
    connectButton.textContent = t("connect_button");
    return;
  }
  connectButton.textContent = `${t("connect_button")} ${shorten(currentPublicKey.toBase58())}`;
}

async function connectWallet() {
  provider = getProvider();
  if (!provider) {
    throw new Error(t("phantom_missing"));
  }

  const response = await provider.connect();
  currentPublicKey = response.publicKey;
  updateConnectButton();
  updateWalletMeta();
  await refreshConnectedMessage();
}

async function submitMessage(messageText) {
  if (!provider || !currentPublicKey) {
    throw new Error(t("phantom_missing"));
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
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    },
    "confirmed"
  );

  return result.signature;
}

languageToggle.addEventListener("click", async () => {
  currentLang = currentLang === "zh" ? "en" : "zh";
  localStorage.setItem("pxsol-lang", currentLang);
  applyTranslations();
  updateWalletMeta();
  await refreshConnectedMessage();
  await refreshBoard();
});

messageInput.addEventListener("input", renderCharCount);

connectButton.addEventListener("click", async () => {
  setStatus("connect_loading");
  try {
    await connectWallet();
    await refreshBoard();
    setStatus("connected_status");
  } catch (error) {
    setStatus("submit_failed", { error: error.message }, true);
  }
});

refreshButton.addEventListener("click", async () => {
  setStatus("refresh_loading");
  try {
    await refreshConnectedMessage();
    await refreshBoard();
    setStatus("refresh_done");
  } catch (error) {
    setStatus("refresh_failed", { error: error.message }, true);
  }
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const messageText = messageInput.value.trim();

  if (!messageText) {
    setStatus("input_empty", {}, true);
    return;
  }
  if (messageText.length > MAX_MESSAGE_LENGTH) {
    setStatus("input_too_long", { max: MAX_MESSAGE_LENGTH }, true);
    return;
  }

  submitButton.disabled = true;
  setStatus("submit_loading");

  try {
    const signature = await submitMessage(messageText);
    messageInput.value = "";
    renderCharCount();
    await refreshConnectedMessage();
    await refreshBoard();
    setStatus("submit_success", { signature });
  } catch (error) {
    const message = error?.message || String(error);
    if (message.includes("User rejected")) {
      setStatus("submit_cancelled", {}, true);
    } else {
      setStatus("submit_failed", { error: message }, true);
    }
  } finally {
    submitButton.disabled = false;
  }
});

window.addEventListener("load", async () => {
  provider = getProvider();
  applyTranslations();
  renderCharCount();

  if (!provider) {
    walletMeta.textContent = t("phantom_missing");
    updateConnectButton();
  } else {
    provider.on?.("connect", async (publicKey) => {
      currentPublicKey = publicKey;
      updateWalletMeta();
      await refreshConnectedMessage();
      await refreshBoard();
    });

    provider.on?.("disconnect", () => {
      currentPublicKey = null;
      connectedCard.hidden = true;
      updateConnectButton();
      updateWalletMeta();
    });
  }

  try {
    if (provider?.isConnected && provider.publicKey) {
      currentPublicKey = provider.publicKey;
      updateConnectButton();
      updateWalletMeta();
      await refreshConnectedMessage();
    }
    await refreshBoard();
    setStatus("init_ready");
  } catch (error) {
    setStatus("init_failed", { error: error.message }, true);
  }
});
