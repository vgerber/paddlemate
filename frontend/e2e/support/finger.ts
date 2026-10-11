import type { CDPSession, Page } from "@playwright/test";

/** One finger driven through the devtools protocol. Steps are spaced so the
 * release speed stays near zero: a slow drag, never a flick. */
export class Finger {
  private constructor(
    private cdp: CDPSession,
    private x: number,
    private y: number,
  ) {}

  static async down(page: Page, x: number, y: number) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    return new Finger(cdp, x, y);
  }

  async moveBy(dx: number, dy = 0, steps = 10, stepMs = 25) {
    for (let i = 1; i <= steps; i++) {
      await this.cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: this.x + (dx * i) / steps, y: this.y + (dy * i) / steps },
        ],
      });
      await new Promise((r) => setTimeout(r, stepMs));
    }
    this.x += dx;
    this.y += dy;
  }

  async up() {
    // Rest a moment so the release speed reads as zero.
    await new Promise((r) => setTimeout(r, 150));
    await this.cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await this.cdp.detach();
  }
}
