import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.NILEDB_POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "Database connection string not found. Set DATABASE_URL or NILEDB_POSTGRES_URL."
  );
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

export default pool;
