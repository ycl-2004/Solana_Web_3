import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplTokenMetadata,
  fetchMetadataFromSeeds,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey } from "@metaplex-foundation/umi";

async function main() {
  const umi = createUmi("https://api.devnet.solana.com").use(
    mplTokenMetadata(),
  );

  const mint = publicKey("7bZemkg2JPfMiVirzBJYPwUgLT7i8VgGaMBYitSoLCoR");

  const metadata = await fetchMetadataFromSeeds(umi, { mint });

  console.log("name   =", metadata.name);
  console.log("symbol =", metadata.symbol);
  console.log("uri    =", metadata.uri);
  console.log("update authority =", metadata.updateAuthority);
}

main().catch(console.error);
