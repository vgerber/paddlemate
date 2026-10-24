import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const script = join(import.meta.dir, "check-colours.sh");
const dirs: string[] = [];

/** Runs the guard on a throwaway source tree; `paint` lists the paint files. */
function run(files: Record<string, string>, paint: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "check-colours-"));
  dirs.push(root);
  const src = join(root, "src");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(src, path)), { recursive: true });
    writeFileSync(join(src, path), text);
  }
  const list = join(root, "paint-files.txt");
  writeFileSync(list, `${paint.join("\n")}\n`);
  const res = Bun.spawnSync(["bash", script, src], {
    env: { ...process.env, PAINT_FILES: list },
  });
  return {
    code: res.exitCode,
    out: res.stdout.toString(),
  };
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("check-colours", () => {
  test("a clean tree passes", () => {
    const res = run(
      {
        "a.tsx": 'const x = withAlpha(tokens.primary, "wash");\n',
        "p.tsx": "const r = tokens.radii.card + tokens.touch.min;\n",
      },
      ["p.tsx"],
    );
    expect(res.out).toBe("");
    expect(res.code).toBe(0);
  });

  test("rule 1: a hex or rgb literal outside theme.ts fails", () => {
    for (const line of [
      'const c = "#1f2b31";',
      'const c = "rgba(31, 43, 49, 0.12)";',
      "a { color: #abc; }",
    ]) {
      const res = run({ "a.tsx": `${line}\n` });
      expect(res.code).toBe(1);
      expect(res.out).toContain("a.tsx:1: rule 1:");
    }
  });

  test("rule 1: theme.ts, tests and mask lines are exempt", () => {
    const res = run({
      "lib/theme.ts": 'const c = "#1f2b31";\n',
      "a.test.ts": 'const c = "#1f2b31";\n',
      "b.tsx": 'const m = "linear-gradient(#000, transparent)"; /* mask */\n',
    });
    expect(res.out).toBe("");
    expect(res.code).toBe(0);
  });

  test("rule 2: a hex-alpha suffix after a template slot fails", () => {
    const res = run({ "a.tsx": "const c = `${tokens.primary}55`;\n" });
    expect(res.code).toBe(1);
    expect(res.out).toContain("a.tsx:1: rule 2:");
  });

  test("rule 2: alphas. fails outside lib/alpha.ts only", () => {
    const bad = run({ "a.tsx": "const c = alphas.wash;\n" });
    expect(bad.code).toBe(1);
    expect(bad.out).toContain("a.tsx:1: rule 2:");
    const ok = run({ "lib/alpha.ts": "const c = alphas.wash;\n" });
    expect(ok.code).toBe(0);
  });

  test("rule 3: a colour token in a paint file fails, layout tokens pass", () => {
    const bad = run({ "m.ts": "const c = tokens.primary;\n" }, ["m.ts"]);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain("m.ts:1: rule 3:");
    const ok = run({ "m.ts": "const r = tokens.canvas.cards;\n" }, ["m.ts"]);
    expect(ok.code).toBe(0);
  });

  test("rule 3: the same token outside a paint file passes", () => {
    const res = run({ "m.ts": "const c = tokens.primary;\n" });
    expect(res.code).toBe(0);
  });

  test("rule 4: white and black as colour names fail", () => {
    for (const line of ['const c = "white";', "const c = 'black';"]) {
      const res = run({ "a.tsx": `${line}\n` });
      expect(res.code).toBe(1);
      expect(res.out).toContain("a.tsx:1: rule 4:");
    }
  });

  test("rule 4: tokens.white and prose are not colour names", () => {
    const res = run({
      "a.tsx": "const c = tokens.white;\nconst s = 'white water';\n",
    });
    expect(res.code).toBe(0);
  });
});
