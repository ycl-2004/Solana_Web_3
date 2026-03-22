import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  fetchDigitalAsset,
  mplTokenMetadata,
  updateV1,
} from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity, publicKey } from "@metaplex-foundation/umi";
import bs58 from "bs58";
import { loadWallet } from "./config";

type InputArgs = {
  mintAddress: string;
  name?: string;
  symbol?: string;
  uri?: string;
};

function parseArgs(): InputArgs {
  const args = process.argv.slice(2);

  const getArg = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    if (index === -1) return undefined;
    return args[index + 1];
  };

  const mintAddress = getArg("--mint");
  if (!mintAddress) {
    throw new Error(
      '缺少 --mint 参数。\n示例：npx tsx update-metadata.ts --mint <MINT_ADDRESS> --name "YC Token" --symbol "YCT" --uri "https://example.com/yc-token.json"',
    );
  }

  return {
    mintAddress,
    name: getArg("--name"),
    symbol: getArg("--symbol"),
    uri: getArg("--uri"),
  };
}

async function main() {
  const { mintAddress, name, symbol, uri } = parseArgs();

  console.log("准备更新 metadata...");
  console.log("Mint =", mintAddress);

  const umi = createUmi("https://api.devnet.solana.com").use(
    mplTokenMetadata(),
  );

  const wallet = loadWallet();
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(wallet.secretKey);
  umi.use(keypairIdentity(umiKeypair));

  const mint = publicKey(mintAddress);

  // 1) 读取完整 digital asset
  const asset = await fetchDigitalAsset(umi, mint);

  console.log("\n当前 metadata：");
  console.log("name      =", asset.metadata.name);
  console.log("symbol    =", asset.metadata.symbol);
  console.log("uri       =", asset.metadata.uri);
  console.log("mutable   =", asset.metadata.isMutable);
  console.log("updateAuth=", asset.metadata.updateAuthority);

  // 2) 没传就保留旧值
  const newName = name ?? asset.metadata.name;
  const newSymbol = symbol ?? asset.metadata.symbol;
  const newUri = uri ?? asset.metadata.uri;

  console.log("\n准备更新为：");
  console.log("name      =", newName);
  console.log("symbol    =", newSymbol);
  console.log("uri       =", newUri);

  // 3) 按官方示例方式更新
  const result = await updateV1(umi, {
    mint,
    authority: umi.identity,
    data: {
      ...asset.metadata,
      name: newName,
      symbol: newSymbol,
      uri: newUri,
    },
  }).sendAndConfirm(umi);

  console.log("\n更新交易已确认。");
  console.log("Signature =", bs58.encode(result.signature));

  // 4) 再读一次确认结果
  const updatedAsset = await fetchDigitalAsset(umi, mint);

  console.log("\n更新后的 metadata：");
  console.log("name      =", updatedAsset.metadata.name);
  console.log("symbol    =", updatedAsset.metadata.symbol);
  console.log("uri       =", updatedAsset.metadata.uri);
  console.log("mutable   =", updatedAsset.metadata.isMutable);
  console.log("updateAuth=", updatedAsset.metadata.updateAuthority);
}

main().catch((err) => {
  console.error("\n执行失败：");
  console.error(err);
  process.exit(1);
});
