// Smoke test for the public gauge coverage map at /tools/gauge-catalog.
// Navigates there, waits for MapLibre + data, and reports what rendered.
import { connect } from "./cdp";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";

const main = async () => {
  const { evaluate, goto, shot, sleep } = await connect();

  await goto(`${BASE}/tools`, 2500);
  const hubHasGaugeTool = await evaluate(
    `!!Array.from(document.querySelectorAll('a')).find((a) => /Gauge coverage/i.test(a.textContent || ''))`,
  );
  console.log("hub lists Gauge coverage:", hubHasGaugeTool);

  await goto(`${BASE}/tools/gauge-catalog`, 4000);
  // Let the map load its tiles + the /gauges/map query resolve.
  await sleep(4000);

  const report = await evaluate(`(() => {
    const canvas = document.querySelector('.maplibregl-canvas');
    const legend = Array.from(document.querySelectorAll('*')).some(
      (n) => (n.textContent || '').trim() === 'Coverage'
    );
    const legendRows = ['Used', 'Fetched', 'Available'].filter((t) =>
      Array.from(document.querySelectorAll('button')).some((b) =>
        (b.textContent || '').includes(t)
      )
    );
    return JSON.stringify({
      hasCanvas: !!canvas,
      canvasSize: canvas ? canvas.width + 'x' + canvas.height : null,
      legend,
      legendRows,
    });
  })()`);
  console.log("page:", report);

  await shot("gauge-catalog");
  console.log("screenshot saved");
  process.exit(0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
