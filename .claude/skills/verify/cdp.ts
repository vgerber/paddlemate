// Shared CDP helpers: connect, navigate, evaluate, click, screenshot.
const CDP = "http://localhost:9222";

export async function connect() {
  const targets = (await (await fetch(`${CDP}/json`)).json()) as any[];
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data as string);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m);
      pending.delete(m.id);
    }
  };
  const send = (method: string, params: any = {}) =>
    new Promise<any>((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1400,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const evaluate = async (expression: string) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error(
        `eval failed: ${JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails)}`,
      );
    }
    return r.result?.result?.value;
  };

  const goto = async (url: string, waitMs = 3000) => {
    await send("Page.navigate", { url });
    await sleep(waitMs);
  };

  const url = () => evaluate("location.href");

  const shot = async (path: string) => {
    const res = await send("Page.captureScreenshot", { format: "png" });
    await Bun.write(path, Buffer.from(res.result.data, "base64"));
    return path;
  };

  /** Click the first element whose text matches, returning whether it hit. */
  const clickText = (selector: string, text: string) =>
    evaluate(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find(e => (e.textContent || "").trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
      if (!el) return false;
      el.click();
      return true;
    })()`);

  return { send, evaluate, goto, url, shot, sleep, clickText, ws };
}
