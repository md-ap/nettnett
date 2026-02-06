import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.NILEDB_POSTGRES_URL ||
  process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("Available env vars:", Object.keys(process.env).filter(k => k.includes("DB") || k.includes("POSTGRES") || k.includes("NILE")).join(", "));
  throw new Error(
    "Database connection string not found. Set DATABASE_URL, NILEDB_POSTGRES_URL, or POSTGRES_URL."
  );
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

export default pool;
