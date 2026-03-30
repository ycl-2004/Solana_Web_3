import { createGenericFile } from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import * as fs from "fs";
import * as path from "path";
import { createUmiInstance } from "./setup";

type NftMetadata = {
  name: string;
  symbol?: string;
  description: string;
  image: string;
  external_url?: string;
  attributes?: Array<{
    trait_type: string;
    value: string;
  }>;
  properties?: {
    category?: string;
    files?: Array<{
      uri: string;
      type: string;
    }>;
  };
};

export async function uploadLegacyNftMetadata() {
  // 1. 创建 Umi 实例，并挂上 Irys 上传能力
  const umi = createUmiInstance().use(
    irysUploader({
      address: "https://devnet.irys.xyz",
    }),
  );

  // 2. 准备普通 NFT 的图片和 metadata 文件路径
  // 这里先复用同一张 future.png，当作练习用的第一张 NFT 图片
  const imagePath = path.resolve(__dirname, "../assets/future.png");
  const metadataPath = path.resolve(
    __dirname,
    "../assets/future-nft-metadata.json",
  );

  // 3. 读取本地图片
  console.log("读取普通 NFT 图片:", imagePath);
  const imageBuffer = fs.readFileSync(imagePath);

  // 4. 包装成 Umi 可以上传的文件对象
  const imageFile = createGenericFile(imageBuffer, "future.png", {
    contentType: "image/png",
  });

  // 5. 先上传图片，拿到图片 URI
  console.log("开始上传普通 NFT 图片到 Irys...");
  const [imageUri] = await umi.uploader.upload([imageFile]);
  if (!imageUri) {
    throw new Error("普通 NFT 图片上传后没有拿到 imageUri");
  }
  console.log("普通 NFT 图片上传成功:", imageUri);

  // 6. 读取普通 NFT 的 metadata JSON
  console.log("读取普通 NFT metadata JSON:", metadataPath);
  const metadata = JSON.parse(
    fs.readFileSync(metadataPath, "utf-8"),
  ) as NftMetadata;

  // 7. 把图片 URI 回填进 metadata
  metadata.image = imageUri;
  metadata.properties = {
    ...metadata.properties,
    files: [
      {
        uri: imageUri,
        type: "image/png",
      },
    ],
  };

  // 8. 再上传 metadata JSON，拿到最终 metadata URI
  console.log("开始上传普通 NFT metadata JSON...");
  const metadataUri = await umi.uploader.uploadJson(metadata);
  if (!metadataUri) {
    throw new Error("普通 NFT metadata 上传后没有拿到 metadataUri");
  }
  console.log("普通 NFT metadata 上传成功:", metadataUri);

  // 9. 返回两条重要结果，给下一步 mint 使用
  return {
    imageUri,
    metadataUri,
  };
}

async function main() {
  // 10. 直接执行普通 NFT metadata 上传流程
  const result = await uploadLegacyNftMetadata();

  // 11. 打印结果，方便复制到 mint 脚本里
  console.log("\n普通 NFT metadata 上传完成");
  console.log("Image URI:", result.imageUri);
  console.log("Metadata URI:", result.metadataUri);
}

main().catch((error) => {
  console.error("普通 NFT metadata 上传失败:", error);
  process.exit(1);
});
