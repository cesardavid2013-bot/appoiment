import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __keptSql?: postgres.Sql; __keptDb?: DB };

function create() {
  const client = postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === "production" ? 20 : 10,
    idle_timeout: 30,
    connect_timeout: 10,
    // Timestamps are always timestamptz; keep Postgres from guessing a local zone.
    connection: { TimeZone: "UTC" },
    onnotice: () => {},
  });
  return { client, db: drizzle(client, { schema, casing: undefined }) };
}

// Reuse the pool across hot reloads in development.
if (!globalForDb.__keptDb) {
  const { client, db } = create();
  globalForDb.__keptSql = client;
  globalForDb.__keptDb = db;
}

export const db = globalForDb.__keptDb!;
export const sqlClient = globalForDb.__keptSql!;
export type Database = DB;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Anything that can run queries: the root db or an open transaction. */
export type Executor = DB | Tx;
export { schema };
