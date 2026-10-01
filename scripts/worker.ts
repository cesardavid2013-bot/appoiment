/**
 * Background worker: emails, SMS, reminders, hold/request expiry, waitlist
 * matching, media processing and housekeeping. Run alongside the web app:
 *   npm run worker
 * Multiple workers are safe (jobs are claimed with SKIP LOCKED).
 */
import "dotenv/config";
import { enqueue } from "../src/server/jobs";
import { log } from "../src/server/logger";
import { runJobsOnce } from "../src/server/worker";

let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

async function main() {
  log.info("worker.started");
  let lastPrune = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastPrune > 6 * 3600_000) {
        await enqueue("maintenance.prune", {}, { dedupeKey: `prune:${new Date().toISOString().slice(0, 13)}` });
        lastPrune = Date.now();
      }
      const n = await runJobsOnce(20);
      if (n === 0) await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      log.error("worker.loop_error", { err });
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  log.info("worker.stopped");
  process.exit(0);
}

main();
