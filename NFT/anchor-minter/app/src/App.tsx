import { useEffect, useMemo, useRef, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  createGenericFile,
  publicKey,
  samePublicKey,
  unwrapOptionRecursively,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplTokenMetadata,
  safeFetchMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys/web";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";

import idl from "../../target/idl/anchor_minter.json";

const DEVNET_ENDPOINT = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("4ZGqxpGWvEC71CDC1tghV7meg6fQ1hnKVgn2iUTYzb56");
const COLLECTION_MINT = new PublicKey("9KuHMCwUmWKsSFiwH3h6TLWKoMSBQe3EtChcjJGCfmAi");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

type MintResult = {
  signature: string;
  mint: string;
  metadataUri: string;
  imageUri: string;
};

type OwnedNft = MintResult & {
  name: string;
  symbol: string;
  description: string;
  mintedAt: string;
};

type ConfigView = {
  authority: string;
  currentSupply: number;
  maxSupply: number;
};

async function fetchMetadataJsonFromUri(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata JSON: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  return JSON.parse(text) as { image?: string; description?: string };
}

function shortAddress(address: string, start = 4, end = 4) {
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

function findMetadataPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function findMasterEditionPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from("edition"),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function findCollectionAuthorityRecordPda(collectionMint: PublicKey, authority: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      collectionMint.toBuffer(),
      Buffer.from("collection_authority"),
      authority.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

async function findOwnedFutureNft(connection: Connection, owner: PublicKey) {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });

  const umi = createUmi(DEVNET_ENDPOINT).use(mplTokenMetadata());

  for (const tokenAccount of tokenAccounts.value) {
    try {
      const parsedInfo = tokenAccount.account.data.parsed.info;
      const amount = parsedInfo.tokenAmount?.uiAmount;
      const decimals = parsedInfo.tokenAmount?.decimals;

      if (amount !== 1 || decimals !== 0) continue;

      const mintAddress = parsedInfo.mint as string;
      const metadataPda = findMetadataPda(new PublicKey(mintAddress));
      const metadata = await safeFetchMetadata(umi, publicKey(metadataPda.toBase58()));

      if (!metadata) continue;

      const collection = unwrapOptionRecursively(metadata.collection) as
        | { key: unknown; verified: boolean }
        | null;
      if (!collection) continue;

      const collectionKey = publicKey(collection.key as any);

      if (
        !samePublicKey(collectionKey, publicKey(COLLECTION_MINT.toBase58())) ||
        !collection.verified
      ) {
        continue;
      }

      let imageUri = "";
      let description = "This wallet already owns a Future collection NFT.";

      try {
        const json = await fetchMetadataJsonFromUri(metadata.uri);
        imageUri = json.image ?? "";
        description = json.description ?? description;
      } catch (metadataJsonError) {
        console.error(metadataJsonError);
      }

      const signatures = await connection.getSignaturesForAddress(new PublicKey(mintAddress), {
        limit: 1,
      });
      const mintedAt = signatures[0]?.blockTime
        ? new Date(signatures[0].blockTime * 1000).toLocaleString()
        : "Unknown";

      return {
        mint: mintAddress,
        metadataUri: metadata.uri,
        imageUri,
        name: metadata.name,
        symbol: metadata.symbol,
        description,
        mintedAt,
        signature: signatures[0]?.signature ?? "",
      } satisfies OwnedNft;
    } catch (tokenDiscoveryError) {
      console.error(tokenDiscoveryError);
    }
  }

  return null;
}

export default function App() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("future member");
  const [symbol, setSymbol] = useState("FTR");
  const [description, setDescription] = useState("把你的图片铸造成 Future collection 里的成员 NFT。");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [status, setStatus] = useState("先连接钱包，再上传图片并填写资料。");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [configView, setConfigView] = useState<ConfigView | null>(null);
  const [ownedNft, setOwnedNft] = useState<OwnedNft | null>(null);
  const [isCheckingOwnedNft, setIsCheckingOwnedNft] = useState(false);
  const [viewerAddressInput, setViewerAddressInput] = useState("");
  const [inspectedWallet, setInspectedWallet] = useState<PublicKey | null>(null);

  const provider = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      return null;
    }

    return new anchor.AnchorProvider(
      connection,
      wallet as unknown as anchor.Wallet,
      anchor.AnchorProvider.defaultOptions()
    );
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new anchor.Program(idl as anchor.Idl, provider) as anchor.Program;
  }, [provider]);

  const [configPda] = useMemo(
    () => PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID),
    []
  );

  const userRecordPda = useMemo(() => {
    if (!wallet.publicKey) return null;
    return PublicKey.findProgramAddressSync(
      [Buffer.from("user"), wallet.publicKey.toBuffer()],
      PROGRAM_ID
    )[0];
  }, [wallet.publicKey]);

  const ownedNftStorageKey = useMemo(
    () => (wallet.publicKey ? `future-owned-nft:${wallet.publicKey.toBase58()}` : null),
    [wallet.publicKey]
  );

  const activeViewer = inspectedWallet ?? wallet.publicKey ?? null;
  const activeViewerAddress = activeViewer?.toBase58() ?? "";
  const isViewingExternalWallet = Boolean(inspectedWallet);

  useEffect(() => {
    if (!previewUrl) return;

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!program) {
      setConfigView(null);
      return;
    }

    let cancelled = false;

    const loadConfig = async () => {
      try {
        const account = await (program.account as any).mintConfig.fetch(configPda);
        if (cancelled) return;

        setConfigView({
          authority: account.authority.toBase58(),
          currentSupply: Number(account.currentSupply),
          maxSupply: Number(account.maxSupply),
        });
      } catch (configError) {
        console.error(configError);
      }
    };

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, [configPda, program]);

  useEffect(() => {
    if (!activeViewer) {
      setOwnedNft(null);
      if (!wallet.publicKey) {
        setStatus("先连接钱包，或贴一个钱包地址来查看 Future collection NFT。");
      }
      return;
    }

    let cancelled = false;

    const loadOwnedNft = async () => {
      setIsCheckingOwnedNft(true);

      try {
        const canUseLocalCache =
          !isViewingExternalWallet &&
          wallet.publicKey &&
          activeViewer.equals(wallet.publicKey) &&
          ownedNftStorageKey;

        if (canUseLocalCache) {
          const cachedRaw = window.localStorage.getItem(ownedNftStorageKey);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw) as OwnedNft;
            if (!cancelled) {
              setOwnedNft(cached);
              setStatus("已检测到你当前持有的 Future collection NFT。");
            }
            return;
          }
        }

        if (!cancelled) {
          setStatus(
            isViewingExternalWallet
              ? `正在查看 ${shortAddress(activeViewer.toBase58(), 4, 4)} 的 Future collection NFT...`
              : "正在读取你当前钱包里的 Future collection NFT..."
          );
        }

        const discovered = await findOwnedFutureNft(connection, activeViewer);

        if (!discovered) {
          if (!cancelled) {
            setOwnedNft(null);
            setStatus(
              isViewingExternalWallet
                ? "这个钱包目前还没有看到 Future collection NFT。"
                : "这个钱包还没有 Future collection NFT，可以开始 mint。"
            );
          }
          return;
        }

        if (canUseLocalCache) {
          window.localStorage.setItem(ownedNftStorageKey, JSON.stringify(discovered));
        }

        if (!cancelled) {
          setOwnedNft(discovered);
          setStatus(
            isViewingExternalWallet
              ? "已读取这个钱包当前持有的 Future collection NFT。"
              : "已检测到你当前持有的 Future collection NFT。"
          );
        }
      } catch (ownedNftError) {
        console.error(ownedNftError);
        if (!cancelled) {
          setOwnedNft(null);
          setStatus(
            isViewingExternalWallet
              ? "读取这个钱包的 NFT 详情失败。"
              : "读取你当前钱包的 NFT 详情失败。"
          );
        }
      } finally {
        if (!cancelled) {
          setIsCheckingOwnedNft(false);
        }
      }
    };

    void loadOwnedNft();

    return () => {
      cancelled = true;
    };
  }, [
    activeViewer,
    connection,
    isViewingExternalWallet,
    ownedNftStorageKey,
    wallet.publicKey,
  ]);

  const handlePickImage = () => fileInputRef.current?.click();

  const handleInspectWallet = () => {
    const nextValue = viewerAddressInput.trim();

    if (!nextValue) {
      if (wallet.publicKey) {
        setInspectedWallet(null);
        setError("");
        setStatus("已切回你当前连接的钱包。");
        return;
      }

      setError("请输入一个钱包地址，或先连接 Phantom。");
      return;
    }

    try {
      const nextWallet = new PublicKey(nextValue);

      if (wallet.publicKey && nextWallet.equals(wallet.publicKey)) {
        setInspectedWallet(null);
        setError("");
        setStatus("这个地址就是你当前连接的钱包，已切回自己的钱包视角。");
        return;
      }

      setInspectedWallet(nextWallet);
      setMintResult(null);
      setError("");
      setStatus(`正在切换到 ${shortAddress(nextWallet.toBase58(), 4, 4)} 的钱包视角。`);
    } catch {
      setError("这个钱包地址格式不正确，请重新 paste 一个 Solana 地址。");
    }
  };

  const handleResetViewer = () => {
    setViewerAddressInput("");
    setInspectedWallet(null);
    setError("");
    setStatus(
      wallet.publicKey
        ? "已切回你当前连接的钱包。"
        : "已退出查看模式，现在可以连接钱包或重新输入一个地址。"
    );
  };

  const handleWalletAction = async () => {
    try {
      if (wallet.connected) {
        await wallet.disconnect();
        return;
      }

      if (!wallet.wallet || wallet.wallet.adapter.name !== "Phantom") {
        wallet.select("Phantom" as never);
        setStatus("Phantom 已选中，再点一次即可连接。");
        return;
      }

      await wallet.connect();
      setError("");
    } catch (walletError) {
      console.error(walletError);
      setError(walletError instanceof Error ? walletError.message : "钱包连接失败。");
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setMintResult(null);
    setError("");
    setStatus("图片已选择，接下来可以直接上传并铸造。");
  };

  const handleBurn = async () => {
    if (!ownedNft || !wallet.publicKey || !program || !userRecordPda) {
      setError("找不到当前要删除的 NFT。");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      setStatus("正在删除你当前持有的 NFT...");

      const nftMint = new PublicKey(ownedNft.mint);
      const nftTokenAccount = PublicKey.findProgramAddressSync(
        [wallet.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), nftMint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
      )[0];

      await (program.methods as any)
        .burnNft()
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 250_000,
          }),
        ])
        .accounts({
          owner: wallet.publicKey,
          config: configPda,
          userRecord: userRecordPda,
          nftMint,
          nftTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      if (ownedNftStorageKey) {
        window.localStorage.removeItem(ownedNftStorageKey);
      }

      setOwnedNft(null);
      setMintResult(null);
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl("");
      setName("future member");
      setSymbol("FTR");
      setDescription("把你的图片铸造成 Future collection 里的成员 NFT。");
      setStatus("当前 NFT 已删除，现在可以重新 mint 一张新的。");

      const refreshedConfig = await (program.account as any).mintConfig.fetch(configPda);
      setConfigView({
        authority: refreshedConfig.authority.toBase58(),
        currentSupply: Number(refreshedConfig.currentSupply),
        maxSupply: Number(refreshedConfig.maxSupply),
      });
    } catch (burnError) {
      console.error(burnError);
      setError(burnError instanceof Error ? burnError.message : "删除 NFT 失败，请稍后再试。");
      setStatus("删除当前 NFT 失败。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMint = async () => {
    const selectedWalletAdapter = wallet.wallet?.adapter;

    if (isViewingExternalWallet) {
      setError("你现在处在查看别人钱包的模式，先切回自己的钱包再 mint。");
      return;
    }

    if (!wallet.connected || !wallet.publicKey || !selectedWalletAdapter) {
      setError("请先连接 Phantom 钱包。");
      return;
    }

    if (!provider || !program) {
      setError("钱包 Provider 还没准备好，请稍后再试。");
      return;
    }

    if (!selectedFile) {
      setError("请先选择一张图片。");
      return;
    }

    if (!name.trim() || !symbol.trim() || !description.trim()) {
      setError("Name、Symbol、Description 都需要填写。");
      return;
    }

    if (ownedNft) {
      setError("你已经 mint 过一张 NFT，需要先删除当前 NFT 才能重新 mint。");
      return;
    }

    setError("");
    setMintResult(null);
    setIsSubmitting(true);

    try {
      setStatus("正在准备浏览器上传器...");

      const umi = createUmi(DEVNET_ENDPOINT)
        .use(walletAdapterIdentity(selectedWalletAdapter))
        .use(mplTokenMetadata())
        .use(irysUploader({ priceMultiplier: 1.1 }));

      setStatus("正在上传图片到 Irys...");

      const imageBuffer = new Uint8Array(await selectedFile.arrayBuffer());
      const imageFile = createGenericFile(imageBuffer, selectedFile.name, {
        contentType: selectedFile.type || "image/png",
      });
      const [imageUri] = await umi.uploader.upload([imageFile]);

      setStatus("正在生成 metadata JSON...");

      const metadataJson = {
        name: name.trim(),
        symbol: symbol.trim(),
        description: description.trim(),
        image: imageUri,
        attributes: [
          { trait_type: "Collection", value: "Future" },
          { trait_type: "Mint Source", value: "Frontend Upload" },
        ],
        properties: {
          category: "image",
          files: [
            {
              uri: imageUri,
              type: selectedFile.type || "image/png",
            },
          ],
        },
      };

      setStatus("正在上传 metadata JSON...");
      const metadataUri = await umi.uploader.uploadJson(metadataJson);

      setStatus("正在准备链上账户...");

      const configAccount = await (program.account as any).mintConfig.fetch(configPda);
      const collectionUpdateAuthority = new PublicKey(configAccount.authority.toBase58());

      const nftMint = Keypair.generate();
      const nftMetadata = findMetadataPda(nftMint.publicKey);
      const nftMasterEdition = findMasterEditionPda(nftMint.publicKey);
      const collectionMetadata = findMetadataPda(COLLECTION_MINT);
      const collectionMasterEdition = findMasterEditionPda(COLLECTION_MINT);
      const collectionAuthorityRecord = findCollectionAuthorityRecordPda(
        COLLECTION_MINT,
        configPda
      );

      setStatus("正在发送 mint 交易...");

      const signature = await (program.methods as any)
        .mintNftWithMetadata(name.trim(), symbol.trim(), metadataUri)
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 400_000,
          }),
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 1,
          }),
        ])
        .accounts({
          minter: wallet.publicKey,
          config: configPda,
          userRecord: userRecordPda,
          nftMint: nftMint.publicKey,
          nftTokenAccount: PublicKey.findProgramAddressSync(
            [
              wallet.publicKey.toBuffer(),
              TOKEN_PROGRAM_ID.toBuffer(),
              nftMint.publicKey.toBuffer(),
            ],
            ASSOCIATED_TOKEN_PROGRAM_ID
          )[0],
          nftMetadata,
          nftMasterEdition,
          collectionMint: COLLECTION_MINT,
          collectionMetadata,
          collectionMasterEdition,
          collectionAuthorityRecord,
          collectionUpdateAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          metadataProgram: TOKEN_METADATA_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .signers([nftMint])
        .rpc();

      const mintedAt = new Date().toLocaleString();
      const result = {
        signature,
        mint: nftMint.publicKey.toBase58(),
        metadataUri,
        imageUri,
      };

      setMintResult(result);
      const owned: OwnedNft = {
        ...result,
        name: name.trim(),
        symbol: symbol.trim(),
        description: description.trim(),
        mintedAt,
      };
      setOwnedNft(owned);
      if (ownedNftStorageKey) {
        window.localStorage.setItem(ownedNftStorageKey, JSON.stringify(owned));
      }
      setStatus("Mint 完成，这张 NFT 已经进入你的 Future collection。");

      const refreshedConfig = await (program.account as any).mintConfig.fetch(configPda);
      setConfigView({
        authority: refreshedConfig.authority.toBase58(),
        currentSupply: Number(refreshedConfig.currentSupply),
        maxSupply: Number(refreshedConfig.maxSupply),
      });
    } catch (mintError) {
      console.error(mintError);
      setError(mintError instanceof Error ? mintError.message : "Mint 失败，请稍后再试。");
      setStatus("这次 mint 没成功。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-topbar">
          <p className="eyebrow">Solana Web 3 · Project 02</p>
        </div>

        <div className="hero-grid">
          <div className="hero-banner">
            <div className="hero-banner-layout">
              <div className="hero-banner-copy">
                <p className="hero-banner-label">Future Collection Mint Interface</p>
                <h1 className="hero-title">
                  <span className="hero-title-line">把自己的照片</span>
                  <span className="hero-title-line">
                    铸造成 <span className="hero-title-accent">Future</span>
                  </span>
                  <span className="hero-title-line hero-title-secondary">Collection</span>
                  <span className="hero-title-line">成员</span>
                </h1>
                <p className="hero-banner-subtitle">
                  Upload your image, generate metadata automatically, then mint one verified NFT
                  into the collection.
                </p>
              </div>

              <div className="wallet-hub wallet-hub-in-hero">
                <button type="button" className="wallet-cta" onClick={handleWalletAction}>
                  {wallet.connected && wallet.publicKey
                    ? `Phantom · ${shortAddress(wallet.publicKey.toBase58(), 4, 4)}`
                    : "Connect Wallet"}
                </button>

                <div className="viewer-tools">
                  <label className="viewer-input-wrap">
                    <span className="viewer-label">Or paste a wallet to preview its NFT</span>
                    <input
                      value={viewerAddressInput}
                      onChange={(event) => setViewerAddressInput(event.target.value)}
                      placeholder="Paste a Solana wallet address"
                    />
                  </label>

                  <div className="viewer-actions">
                    <button
                      type="button"
                      className="ghost viewer-button"
                      onClick={handleInspectWallet}
                    >
                      View Wallet
                    </button>
                    {isViewingExternalWallet ? (
                      <button
                        type="button"
                        className="ghost viewer-button"
                        onClick={handleResetViewer}
                      >
                        Back to Mine
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="hero-overview">
            <div className="hero-copy">
              <p className="hero-kicker">About This Project</p>
              <p className="intro">
                这是你这个 project 的前端 mint 入口。用户可以直接上传自己的照片，填写
                NFT 名称和描述，页面会自动生成 metadata JSON，然后调用 Anchor 程序把
                NFT 验证进现有的 Future collection。
              </p>

              <div className="hero-highlights">
                <span className="hero-pill">自定义上传图片</span>
                <span className="hero-pill">自动生成 Metadata</span>
                <span className="hero-pill hero-pill-accent">Green Free Mint</span>
                <span className="hero-pill">One Wallet Per</span>
                <span className="hero-pill">One NFT</span>
              </div>
            </div>

            <aside className="panel hero-sidecard">
              <p className="side-label">Current Setup</p>
              <div className="side-metric">
                <span className="side-metric-label">Network</span>
                <strong>Solana Devnet</strong>
              </div>
              <div className="side-metric">
                <span className="side-metric-label">Collection</span>
                <strong>{shortAddress(COLLECTION_MINT.toBase58(), 6, 6)}</strong>
              </div>
              <div className="side-metric">
                <span className="side-metric-label">Viewing</span>
                <strong>
                  {activeViewerAddress ? shortAddress(activeViewerAddress, 4, 4) : "No wallet yet"}
                </strong>
              </div>
              <div className="side-metric">
                <span className="side-metric-label">Project Rule</span>
                <strong>免费 mint，每钱包一张</strong>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="panel wallet-panel">
        <div className="panel-head">
          <div>
            <h2>项目配置</h2>
            <p className="panel-subtitle">
              这个 mint 页面会把新 NFT 自动验证进你已经建立好的 Future collection。
            </p>
          </div>
          <span className="badge">Project 02</span>
        </div>

        <div className="detail-grid">
          <div className="detail-item">
            <span className="detail-label">Program</span>
            <span className="detail-value mono">{PROGRAM_ID.toBase58()}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Collection Owner</span>
            <span className="detail-value mono">
              {configView ? configView.authority : "读取中..."}
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Current Supply</span>
            <span className="detail-value">
              {configView ? `${configView.currentSupply} / ${configView.maxSupply}` : "读取中..."}
            </span>
          </div>
          <div className="detail-item">
            <span className="detail-label">
              {isViewingExternalWallet ? "Viewing Wallet" : "Connected Wallet"}
            </span>
            <span className="detail-value mono">
              {activeViewerAddress || "尚未连接"}
            </span>
          </div>
        </div>

        <p className="hint">
          这里不收项目额外费用。用户主要承担图片上传、metadata 上传，以及链上账户创建所需的
          devnet SOL。
        </p>
      </section>

      <section className="panel composer">
        <div className="panel-head">
          <div>
            <h2>自定义 NFT Mint</h2>
            <p className="panel-subtitle">
              {isViewingExternalWallet
                ? "当前是查看模式。你可以先看别人钱包里的 NFT 长什么样子，再切回自己的钱包来 mint。"
                : ownedNft
                  ? "你已经拥有一张 Future collection NFT。若想重新自定义，请先删除当前这张。"
                  : "上传一张图片，填写 Name、Symbol、Description，前端会帮你生成 JSON。"}
            </p>
          </div>
        </div>

        <div className="composer-grid">
          <div className="composer-left">
            {ownedNft ? (
              <div className="owned-card">
                <p className="surface-label">
                  {isViewingExternalWallet ? "Viewing Wallet NFT" : "Current Owned NFT"}
                </p>
                <h3>{ownedNft.name}</h3>
                <p className="owned-description">{ownedNft.description}</p>
                <div className="owned-meta">
                  <div className="detail-item">
                    <span className="detail-label">Minted At</span>
                    <span className="detail-value">{ownedNft.mintedAt}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Symbol</span>
                    <span className="detail-value">{ownedNft.symbol}</span>
                  </div>
                </div>
                <div className="result-card compact">
                  <div className="result-row">
                    <span>Mint</span>
                    <span className="mono">{ownedNft.mint}</span>
                  </div>
                  <div className="result-row">
                    <span>Metadata</span>
                    <a
                      href={ownedNft.metadataUri}
                      target="_blank"
                      rel="noreferrer"
                      className="mono result-link"
                    >
                      {ownedNft.metadataUri}
                    </a>
                  </div>
                  <div className="result-row">
                    <span>Image</span>
                    <a
                      href={ownedNft.imageUri}
                      target="_blank"
                      rel="noreferrer"
                      className="mono result-link"
                    >
                      {ownedNft.imageUri}
                    </a>
                  </div>
                  {ownedNft.signature ? (
                    <div className="result-row">
                      <span>Tx</span>
                      <a
                        href={`https://explorer.solana.com/tx/${ownedNft.signature}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono result-link"
                      >
                        {ownedNft.signature}
                      </a>
                    </div>
                  ) : null}
                </div>
                {!isViewingExternalWallet ? (
                  <>
                    <div className="composer-actions">
                      <button
                        type="button"
                        className="danger"
                        onClick={handleBurn}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "删除中..." : "删除当前 NFT 后重新 mint"}
                      </button>
                    </div>
                    <p className="hint">
                      当前合约里的删除逻辑是基础版 burn：会烧掉 token、关闭 ATA、恢复重新 mint 资格，
                      但不会一并删除 metadata / master edition 账户。
                    </p>
                  </>
                ) : (
                  <p className="hint">
                    当前是只读查看模式。若你想 mint 自己的 NFT，先点击上方的 `Back to Mine`。
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="field-grid">
                  <label>
                    <span>Name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="future member"
                    />
                  </label>

                  <label>
                    <span>Symbol</span>
                    <input
                      value={symbol}
                      onChange={(event) => setSymbol(event.target.value)}
                      placeholder="FTR"
                      maxLength={10}
                    />
                  </label>
                </div>

                <label>
                  <span>Description</span>
                  <textarea
                    rows={5}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="写下这张 NFT 想表达的内容。"
                  />
                </label>

                <div className="upload-strip">
                  <button type="button" className="ghost" onClick={handlePickImage}>
                    {selectedFile ? `已选择：${selectedFile.name}` : "选择图片"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  <p className="hint">
                    支持从浏览器直接上传图片。上传完成后，页面会自动把图片 URI 写进 metadata JSON。
                  </p>
                </div>

                <div className="composer-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={handleMint}
                    disabled={isSubmitting || isCheckingOwnedNft || isViewingExternalWallet}
                  >
                    {isViewingExternalWallet
                      ? "Viewing Mode"
                      : isSubmitting
                        ? "上传并铸造中..."
                        : "上传并铸造成 Collection NFT"}
                  </button>
                </div>

                {isViewingExternalWallet ? (
                  <p className="hint">
                    现在你在查看别人的钱包，所以 mint 功能先锁住。切回自己的钱包后就可以继续上传和铸造。
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="composer-right">
            <div className="preview-panel">
              {(ownedNft?.imageUri || previewUrl) ? (
                <img
                  src={ownedNft?.imageUri || previewUrl}
                  alt="NFT preview"
                  className="preview-image"
                />
              ) : (
                <div className="preview-placeholder">Preview</div>
              )}

              <div className="preview-copy">
                <p className="surface-label">{ownedNft ? "Current NFT" : "Live Preview"}</p>
                <h3>{ownedNft?.name || name || "Untitled NFT"}</h3>
                <p>{ownedNft?.description || description || "这里会显示你的 NFT 说明。"}</p>
              </div>
            </div>

            <div className="status-card">
              <p className="surface-label">Status</p>
              <p className={`status ${error ? "status-error" : ""}`}>{error || status}</p>
            </div>

            {mintResult ? (
              <div className="result-card">
                <p className="surface-label">Latest Mint Result</p>
                <div className="result-row">
                  <span>Mint</span>
                  <span className="mono">{mintResult.mint}</span>
                </div>
                <div className="result-row">
                  <span>Metadata</span>
                  <a
                    href={mintResult.metadataUri}
                    target="_blank"
                    rel="noreferrer"
                    className="mono result-link"
                  >
                    {mintResult.metadataUri}
                  </a>
                </div>
                <div className="result-row">
                  <span>Image</span>
                  <a
                    href={mintResult.imageUri}
                    target="_blank"
                    rel="noreferrer"
                    className="mono result-link"
                  >
                    {mintResult.imageUri}
                  </a>
                </div>
                <div className="result-row">
                  <span>Tx</span>
                  <a
                    href={`https://explorer.solana.com/tx/${mintResult.signature}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="mono result-link"
                  >
                    {mintResult.signature}
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
