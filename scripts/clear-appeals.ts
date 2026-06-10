import pkg from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/"/g, "").replace("?pgbouncer=true", ""),
});

async function clear() {
  await pool.query("DELETE FROM appeals");
  console.log("✓  appeals cleared");
  await pool.end();
  console.log("Done — submissions and questions untouched.");
}

clear().catch((err) => {
  console.error(err);
  process.exit(1);
});
