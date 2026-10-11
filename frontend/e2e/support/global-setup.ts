import { execFileSync } from "node:child_process";

// The fixture's gauge readings are seeded relative to the time of seeding, so
// a day later they are stale and every level pill disappears. Re-insert them
// relative to now. Local dev database only (the dev-services container).
const SQL = `
DELETE FROM gauge_readings WHERE series_id = 9401;
INSERT INTO gauge_readings (series_id, measured_at, value)
SELECT 9401, NOW() - (n || ' hours')::interval, 85 + 30 * sin(n / 12.0)
FROM generate_series(0, 168, 2) AS n;
`;

export default function globalSetup() {
  execFileSync(
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
      "-q",
    ],
    { input: SQL, stdio: ["pipe", "ignore", "inherit"] },
  );
}
