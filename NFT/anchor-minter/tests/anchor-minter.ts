import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AnchorMinter } from "../target/types/anchor_minter";

describe("anchor-minter", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.anchorMinter as Program<AnchorMinter>;
  const authority = provider.wallet;

  const collectionMint = new PublicKey(
    "9KuHMCwUmWKsSFiwH3h6TLWKoMSBQe3EtChcjJGCfmAi"
  );
  // 这条线我们现在走免费 mint，所以 mint price 先固定为 0。
  const mintPrice = new BN(0);
  const maxSupply = 100;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const getUserRecordPda = (owner: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("user"), owner.toBuffer()],
      program.programId
    )[0];

  it("初始化 MintConfig", async () => {
    const tx = await program.methods
      .initialize(collectionMint, mintPrice, maxSupply)
      .accounts({
        authority: authority.publicKey,
        treasury: authority.publicKey,
      })
      .rpc();

    const config = await program.account.mintConfig.fetch(configPda);

    console.log("Initialize tx:", tx);
    console.log("Config PDA:", configPda.toBase58());

    if (!config.authority.equals(authority.publicKey)) {
      throw new Error("authority 没有正确写入 config");
    }

    if (!config.collectionMint.equals(collectionMint)) {
      throw new Error("collection mint 没有正确写入 config");
    }

    if (!config.treasury.equals(authority.publicKey)) {
      throw new Error("treasury 没有正确写入 config");
    }

    if (config.mintPrice.toString() !== mintPrice.toString()) {
      throw new Error("mint price 没有正确写入 config");
    }

    if (config.currentSupply !== 0) {
      throw new Error("current supply 初始化应该是 0");
    }

    if (config.maxSupply !== maxSupply) {
      throw new Error("max supply 没有正确写入 config");
    }
  });

  it("不能重复初始化同一个 config PDA", async () => {
    let failed = false;

    try {
      await program.methods
        .initialize(collectionMint, mintPrice, maxSupply)
        .accounts({
          authority: authority.publicKey,
          treasury: authority.publicKey,
        })
        .rpc();
    } catch (error) {
      failed = true;
    }

    if (!failed) {
      throw new Error("同一个 config PDA 不应该允许重复初始化");
    }
  });

  it("同一个钱包只能 mint 一次", async () => {
    const minter = Keypair.generate();
    const nftMint = Keypair.generate();

    // 给测试钱包一点 SOL，用来支付账户初始化租金。
    const sig = await provider.connection.requestAirdrop(
      minter.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    const [userRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user"), minter.publicKey.toBuffer()],
      program.programId
    );
    const nftTokenAccount = getAssociatedTokenAddressSync(
      nftMint.publicKey,
      minter.publicKey
    );

    // 第一次 mint：应该成功。
    await program.methods
      .mintNft()
      .accounts({
        minter: minter.publicKey,
        nftMint: nftMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([minter, nftMint])
      .rpc();

    const userRecord = await program.account.userRecord.fetch(userRecordPda);
    const config = await program.account.mintConfig.fetch(configPda);
    const tokenBalance = await provider.connection.getTokenAccountBalance(
      nftTokenAccount
    );

    if (!userRecord.owner.equals(minter.publicKey)) {
      throw new Error("user record 没有正确记录 minter");
    }

    if (userRecord.mintCount !== 1) {
      throw new Error("mint count 应该是 1");
    }

    if (config.currentSupply !== 1) {
      throw new Error("current supply 应该增加到 1");
    }

    if (tokenBalance.value.amount !== "1") {
      throw new Error("用户应该收到 1 个 NFT token");
    }

    // 第二次 mint：应该失败。
    let secondMintFailed = false;
    const nftMint2 = Keypair.generate();
    const nftTokenAccount2 = getAssociatedTokenAddressSync(
      nftMint2.publicKey,
      minter.publicKey
    );
    try {
      await program.methods
        .mintNft()
        .accounts({
          minter: minter.publicKey,
          nftMint: nftMint2.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([minter, nftMint2])
        .rpc();
    } catch (error) {
      secondMintFailed = true;
    }

    if (!secondMintFailed) {
      throw new Error("同一个钱包第二次 mint 应该失败");
    }
  });

  it("不同钱包可以各 mint 一次", async () => {
    const minterA = Keypair.generate();
    const minterB = Keypair.generate();
    const nftMintA = Keypair.generate();
    const nftMintB = Keypair.generate();

    const sigA = await provider.connection.requestAirdrop(
      minterA.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sigA, "confirmed");

    const sigB = await provider.connection.requestAirdrop(
      minterB.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sigB, "confirmed");

    const userRecordA = getUserRecordPda(minterA.publicKey);
    const userRecordB = getUserRecordPda(minterB.publicKey);
    const tokenAccountA = getAssociatedTokenAddressSync(
      nftMintA.publicKey,
      minterA.publicKey
    );
    const tokenAccountB = getAssociatedTokenAddressSync(
      nftMintB.publicKey,
      minterB.publicKey
    );

    await program.methods
      .mintNft()
      .accounts({
        minter: minterA.publicKey,
        nftMint: nftMintA.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([minterA, nftMintA])
      .rpc();

    await program.methods
      .mintNft()
      .accounts({
        minter: minterB.publicKey,
        nftMint: nftMintB.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([minterB, nftMintB])
      .rpc();

    const recordA = await program.account.userRecord.fetch(userRecordA);
    const recordB = await program.account.userRecord.fetch(userRecordB);
    const balanceA = await provider.connection.getTokenAccountBalance(
      tokenAccountA
    );
    const balanceB = await provider.connection.getTokenAccountBalance(
      tokenAccountB
    );

    if (recordA.mintCount !== 1 || recordB.mintCount !== 1) {
      throw new Error("不同钱包应该都能各自成功 mint 一次");
    }

    if (balanceA.value.amount !== "1" || balanceB.value.amount !== "1") {
      throw new Error("两个不同钱包都应该各收到 1 个 NFT token");
    }
  });

  it("销毁后可以再次 mint", async () => {
    const owner = Keypair.generate();
    const firstMint = Keypair.generate();
    const secondMint = Keypair.generate();

    const sig = await provider.connection.requestAirdrop(
      owner.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    const userRecordPda = getUserRecordPda(owner.publicKey);
    const firstTokenAccount = getAssociatedTokenAddressSync(
      firstMint.publicKey,
      owner.publicKey
    );
    const secondTokenAccount = getAssociatedTokenAddressSync(
      secondMint.publicKey,
      owner.publicKey
    );

    const supplyBefore = (await program.account.mintConfig.fetch(configPda))
      .currentSupply;

    // 第一次 mint。
    await program.methods
      .mintNft()
      .accounts({
        minter: owner.publicKey,
        nftMint: firstMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner, firstMint])
      .rpc();

    let userRecord = await program.account.userRecord.fetch(userRecordPda);
    let config = await program.account.mintConfig.fetch(configPda);

    if (userRecord.mintCount !== 1) {
      throw new Error("第一次 mint 后，mintCount 应该是 1");
    }

    if (config.currentSupply !== supplyBefore + 1) {
      throw new Error("第一次 mint 后，supply 应该增加 1");
    }

    // 销毁刚刚 mint 的 NFT。
    await (program.methods as any)
      .burnNft()
      .accounts({
        owner: owner.publicKey,
        nftMint: firstMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();

    userRecord = await program.account.userRecord.fetch(userRecordPda);
    config = await program.account.mintConfig.fetch(configPda);
    const firstTokenAccountInfo = await provider.connection.getAccountInfo(
      firstTokenAccount
    );

    if (userRecord.mintCount !== 0) {
      throw new Error("销毁后，mintCount 应该回到 0");
    }

    if (config.currentSupply !== supplyBefore) {
      throw new Error("销毁后，supply 应该回到原本的值");
    }

    if (firstTokenAccountInfo !== null) {
      throw new Error("销毁后，原本的 ATA 应该被关闭");
    }

    // 再次 mint：现在应该重新允许。
    await program.methods
      .mintNft()
      .accounts({
        minter: owner.publicKey,
        nftMint: secondMint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner, secondMint])
      .rpc();

    userRecord = await program.account.userRecord.fetch(userRecordPda);
    config = await program.account.mintConfig.fetch(configPda);
    const secondTokenBalance = await provider.connection.getTokenAccountBalance(
      secondTokenAccount
    );

    if (userRecord.mintCount !== 1) {
      throw new Error("重新 mint 后，mintCount 应该再次变成 1");
    }

    if (config.currentSupply !== supplyBefore + 1) {
      throw new Error("重新 mint 后，supply 应该再次增加 1");
    }

    if (secondTokenBalance.value.amount !== "1") {
      throw new Error("重新 mint 后，用户应该再次收到 1 个 NFT token");
    }
  });
});
