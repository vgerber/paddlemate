// Interaction test: cluster click zooms in, point click opens the detail card.
import { connect } from "./cdp";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";

const main = async () => {
  const { send, evaluate, goto, shot, sleep } = await connect();

  const clickAt = async (x: number, y: number) => {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        clickCount: 1,
      });
    }
  };

  await goto(`${BASE}/tools/gauge-catalog`, 4000);
  await sleep(3500);

  // Repeatedly click a spot with a cluster to zoom until points separate.
  // Center-ish over the Alps, which is dense with clusters.
  for (let i = 0; i < 6; i++) {
    await clickAt(715, 450);
    await sleep(900);
  }
  await shot("gauge-catalog-zoomed");

  // Try a few isolated-point locations (small dots visible after the zoom)
  // until the detail card appears.
  const candidates: [number, number][] = [
    [120, 535],
    [155, 770],
    [535, 768],
    [18, 448],
    [1367, 320],
  ];
  const cardVisible = async () =>
    JSON.parse(
      await evaluate(
        `JSON.stringify(Array.from(document.querySelectorAll('*')).some((n) => /Measurements:|Not yet fetched/i.test(n.textContent || '')))`,
      ),
    );
  let hit = false;
  for (const [x, y] of candidates) {
    await clickAt(x, y);
    await sleep(500);
    if (await cardVisible()) {
      hit = true;
      console.log(`detail card opened after clicking (${x}, ${y})`);
      break;
    }
  }
  console.log("detailCardVisible:", hit);
  await shot("gauge-catalog-detail");
  console.log("done");
  process.exit(0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
