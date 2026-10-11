import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.tsx$/.test(e.name) ? [path] : [];
  });
}

// MUI 9 drops the dotted palette path on Typography's color prop, so the text
// renders in full ink. The camel-case form (textSecondary) is the working one.
test("no color prop uses the dotted text palette path", () => {
  const bad = sources("src").filter((f) =>
    /color="text\.(primary|secondary|disabled)"/.test(readFileSync(f, "utf8")),
  );
  expect(bad).toEqual([]);
});
