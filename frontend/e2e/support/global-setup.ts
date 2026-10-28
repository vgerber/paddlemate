import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The fixture's gauge readings are seeded relative to the time of seeding, so
// a day later they are stale and every level pill disappears. Re-insert them
// relative to now. Local dev database only (the dev-services container).
const SQL = `
DELETE FROM gauge_readings WHERE series_id = 9401;
INSERT INTO gauge_readings (series_id, measured_at, value)
SELECT 9401, NOW() - (n || ' hours')::interval, 85 + 30 * sin(n / 12.0)
FROM generate_series(0, 168, 2) AS n;
`;

// The fixture trip spans today when seeded (three days either side); days
// later it has ended and the plan specs see no current week. Reseed the
// fixture then, with the test-data skill's own scripts.
const TRIP_SPANS_TODAY =
  "SELECT count(*) FROM trips WHERE id = 9001 AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE;";
const FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.claude/skills/test-data",
);

function psql(input: string, quiet = true): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "paddlemate-db-1",
      "psql",
      "-U",
      "postgres",
      "-d",
      "paddlemate",
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      ...(quiet ? ["-q"] : []),
    ],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] },
  );
}

export default function globalSetup() {
  if (psql(TRIP_SPANS_TODAY).trim() !== "1") {
    psql(readFileSync(resolve(FIXTURE, "cleanup.sql"), "utf8"));
    psql(readFileSync(resolve(FIXTURE, "seed.sql"), "utf8"));
  }
  psql(SQL);
}
