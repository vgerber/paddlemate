// Rasterises public/favicon.svg to public/_fav{16,32,48}.png for favicon.ico,
// and the full-bleed teal tile sources in scripts/icon-src to the maskable and
// Apple icons (the mark already sits inside the safe zone). sharp renders at a
// density high enough for a crisp edge.
import sharp from "sharp";

const render = (src, size, out) =>
  sharp(src, { density: 72 * (512 / size) * (size < 128 ? 1 : 0.25) })
    .resize(size, size)
    .png()
    .toFile(out);

for (const size of [16, 32, 48]) {
  await render("public/favicon.svg", size, `public/_fav${size}.png`);
}
await render(
  "scripts/icon-src/maskable.svg",
  512,
  "public/maskable-icon-512x512.png",
);
await render(
  "scripts/icon-src/apple.svg",
  180,
  "public/apple-touch-icon-180x180.png",
);
