import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { simulateGames, toNdjsonLine } from "./simulation.js";
import type { Team } from "../src/types.js";

// ── CLI arg parsing ───────────────────────────────────────────────────────────

function parseArgs(): { games: number; seed: number; out: string } {
  const args = process.argv.slice(2);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const defaultOut = path.join(__dirname, "output", "simulation-results.ndjson");

  let games = 100;
  let seed = 12345;
  let out = defaultOut;

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const next = args[i + 1];
    if (flag === "--games" && next !== undefined) {
      games = parseInt(next, 10);
      i++;
    } else if (flag === "--seed" && next !== undefined) {
      seed = parseInt(next, 10);
      i++;
    } else if (flag === "--out" && next !== undefined) {
      // Resolve relative paths from the repo root so paths like
      // "packages/engine/scripts/output/foo.ndjson" work when invoked via
      // `pnpm --filter engine simulate` (pnpm sets cwd to the package dir,
      // not the repo root where the user typed the command).
      const repoRoot = path.resolve(__dirname, "../../..");
      out = path.isAbsolute(next) ? next : path.resolve(repoRoot, next);
      i++;
    }
  }

  if (!Number.isInteger(games) || games < 1) {
    console.error(`Error: --games must be a positive integer (got "${process.argv[process.argv.indexOf("--games") + 1]}")`);
    process.exit(1);
  }
  if (!Number.isInteger(seed)) {
    console.error(`Error: --seed must be an integer (got "${process.argv[process.argv.indexOf("--seed") + 1]}")`);
    process.exit(1);
  }

  return { games, seed, out };
}

function main(): void {
  const { games, seed: baseSeed, out } = parseArgs();

  const outDir = path.dirname(out);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const records = simulateGames(games, baseSeed);
  fs.writeFileSync(out, records.map(toNdjsonLine).join(""));

  let totalTricks = 0;
  let bidsMade = 0;
  let wentSet = 0;

  for (const record of records) {
    totalTricks += record.transcript.length;

    const { outcome } = record;
    const bidderTeam: Team = outcome.bidder === "N" || outcome.bidder === "S" ? "NS" : "EW";
    const bidderTotal = bidderTeam === "NS" ? outcome.nsTotal : outcome.ewTotal;
    if (bidderTotal >= outcome.bidAmount) {
      bidsMade++;
    } else {
      wentSet++;
    }
  }

  console.log(`Games completed:   ${games}`);
  console.log(`Total tricks:      ${totalTricks}`);
  console.log(`Bids made:         ${bidsMade}`);
  console.log(`Went set:          ${wentSet}`);
  console.log(`Output:            ${out}`);
}

main();
