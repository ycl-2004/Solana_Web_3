import { createGenericFile } from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import * as fs from "fs";
import * as path from "path";
import { createUmiInstance } from "./setup";

type CollectionMetadata = {
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

export async function uploadCollectionMetadata() {
  // 1. 创建 Umi 实例，并注册 Irys 上传插件
  // 这样 umi 就拥有了 `uploader` 能力，可以把图片和 JSON 上传到去中心化存储
  const umi = createUmiInstance().use(
    irysUploader({
      // 这里使用的是 Irys 的 devnet 地址，适合练习和测试
      address: "https://devnet.irys.xyz",
    }),
  );

  // 2. 准备本地文件路径
  // imagePath: 你要上传的 collection 图片
  // metadataPath: 你准备好的 metadata JSON 文件
  const imagePath = path.resolve(__dirname, "../assets/future.png");
  const metadataPath = path.resolve(
    __dirname,
    "../assets/future-metadata.json",
  );

  // 3. 读取本地图片文件
  // fs.readFileSync 会把图片读成 Buffer，后面才能交给 umi 上传
  console.log("读取图片:", imagePath);
  const imageBuffer = fs.readFileSync(imagePath);

  // 4. 把 Buffer 包装成 Umi 认识的文件格式
  // createGenericFile 会告诉 umi：
  // - 文件内容是什么
  // - 文件名是什么
  // - 文件类型是什么
  const imageFile = createGenericFile(imageBuffer, "future.png", {
    contentType: "image/png",
  });

  // 5. 上传图片
  // umi.uploader.upload([...]) 接收的是文件数组，所以这里要传 [imageFile]
  // 上传成功后会返回一个 URI 数组，这里我们取第一个图片的 URI
  console.log("开始上传图片到 Irys...");
  const [imageUri] = await umi.uploader.upload([imageFile]);
  if (!imageUri) {
    throw new Error("图片上传后没有拿到 imageUri");
  }
  console.log("图片上传成功:", imageUri);

  // 6. 读取本地 metadata JSON
  // 这里先把 JSON 文件读出来，再转成 JavaScript 对象
  console.log("读取本地 metadata JSON:", metadataPath);
  const metadata = JSON.parse(
    fs.readFileSync(metadataPath, "utf-8"),
  ) as CollectionMetadata;

  // 7. 把刚刚上传好的图片 URI 填回 metadata
  // 重点：
  // - metadata.image 是 NFT 展示图的主链接
  // - properties.files 里通常也会再记录一次文件信息
  // 这样上传出来的 metadata 才是真正可用的完整 metadata
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

  // 8. 上传 metadata JSON
  // uploadJson 会把这个 JavaScript 对象上传成一个 JSON 文件
  // 返回值 metadataUri，就是你之后 createNft 时要传入的 `uri`
  console.log("开始上传 metadata JSON...");
  const metadataUri = await umi.uploader.uploadJson(metadata);
  if (!metadataUri) {
    throw new Error("Metadata 上传后没有拿到 metadataUri");
  }
  console.log("Metadata 上传成功:", metadataUri);

  // 9. 把两个关键结果返回出去
  // imageUri: 图片链接
  // metadataUri: metadata 链接
  // 下一步创建 Collection NFT 时，真正要用的是 metadataUri
  return {
    imageUri,
    metadataUri,
  };
}

async function main() {
  // 10. 直接执行上传流程
  const result = await uploadCollectionMetadata();

  // 11. 打印最终结果，方便你复制到下一步代码里使用
  console.log("\n上传完成");
  console.log("Image URI:", result.imageUri);
  console.log("Metadata URI:", result.metadataUri);
}

// 12. 如果上传过程中有任何错误，就在终端打印出来
main().catch((error) => {
  console.error("上传失败:", error);
  process.exit(1);
});
