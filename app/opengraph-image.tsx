import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const alt = "굴림";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const imagePath = path.join(process.cwd(), "public", "og", "gulrim-social.png");
  const imageBuffer = await readFile(imagePath);
  const imageDataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      // Use the approved social thumbnail as-is for stable Kakao previews.
      <img
        src={imageDataUrl}
        alt="굴림"
        width={size.width}
        height={size.height}
        style={{ objectFit: "cover" }}
      />
    ),
    size,
  );
}
