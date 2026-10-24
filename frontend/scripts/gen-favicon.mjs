// Rasterises public/favicon.svg to public/_fav{16,32,48}.png for favicon.ico.
// sharp renders at a density high enough for a crisp 16px edge.
import sharp from "sharp";

for (const size of [16, 32, 48]) {
  await sharp("public/favicon.svg", { density: 72 * (512 / size) })
    .resize(size, size)
    .png()
    .toFile(`public/_fav${size}.png`);
}
