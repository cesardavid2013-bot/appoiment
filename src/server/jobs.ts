import "server-only";
import { sql } from "drizzle-orm";
import { db, type Executor } from "./db/client";
import { jobs } from "./db/schema";
import { log } from "./logger";

export type JobType =
  | "email.send"
  | "sms.send"
  | "appointment.reminder"
  | "appointment.expire_hold"
  | "appointment.expire_request"
  | "appointment.review_request"
  | "waitlist.check"
  | "media.process_video"
  | "maintenance.prune";

export async function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
  opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number; tx?: Executor } = {},
) {
  const exec = opts.tx ?? db;
  await exec
    .insert(jobs)
    .values({ type, payload, runAt: opts.runAt ?? new Date(), dedupeKey: opts.dedupeKey, maxAttempts: opts.maxAttempts ?? 5 })
    .onConflictDoNothing();
}

type ClaimedJob = { id: number; type: JobType; payload: Record<string, unknown>; attempts: number; max_attempts: number };

/** Atomically claims ready jobs; safe with multiple workers (SKIP LOCKED). */
export async function claimJobs(limit = 10): Promise<ClaimedJob[]> {
  // Recover jobs whose worker died mid-flight.
  await db.execute(
    sql`update jobs set status = 'pending', locked_at = null where status = 'running' and locked_at < now() - interval '10 minutes'`,
  );
  const rows = await db.execute<ClaimedJob>(sql`
    update jobs set status = 'running', locked_at = now(), attempts = attempts + 1
    where id in (
      select id from jobs where status = 'pending' and run_at <= now()
      order by run_at limit ${limit} for update skip locked
    )
    returning id, type, payload, attempts, max_attempts`);
  return [...rows];
}

export async function completeJob(id: number) {
  await db.execute(sql`update jobs set status = 'done', completed_at = now(), locked_at = null where id = ${id}`);
}

export async function failJob(job: ClaimedJob, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const final = job.attempts >= job.max_attempts;
  const backoffSeconds = Math.min(3600, 30 * 2 ** (job.attempts - 1));
  await db.execute(sql`
    update jobs set
      status = ${final ? "failed" : "pending"},
      locked_at = null,
      last_error = ${message.slice(0, 1000)},
      run_at = now() + make_interval(secs => ${backoffSeconds})
    where id = ${job.id}`);
  log[final ? "error" : "warn"]("job.failed", { id: job.id, type: job.type, attempts: job.attempts, final, err: message });
}

export async function cancelJobsByDedupePrefix(prefix: string, tx: Executor = db) {
  await tx.execute(sql`update jobs set status = 'cancelled' where status = 'pending' and dedupe_key like ${prefix + "%"}`);
}
