import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function init() {
  if (_db) return;
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  _db = drizzle(_pool, { schema });
}

export const pool = new Proxy<pg.Pool>({} as pg.Pool, {
  get(_, prop) {
    init();
    return (_pool as any)[prop];
  },
});

export const db = new Proxy<ReturnType<typeof drizzle>>({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    init();
    return (_db as any)[prop];
  },
});

export * from "./schema";
