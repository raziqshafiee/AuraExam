import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'zod'; // We used zod 4, but we need to read .env
import fs from 'fs';

// Simple manual .env parser since we can't easily import dotenv here
const env = fs.readFileSync('.env', 'utf8')
  .split('\n')
  .reduce((acc, line) => {
    const [key, ...val] = line.split('=');
    if (key && val) acc[key.trim()] = val.join('=').trim();
    return acc;
  }, {} as any);

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

console.log("Testing connection to:", env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Connection failed:', err.message);
    if (err.message.includes('password authentication failed')) {
      console.log('\n💡 TIP: If your password has special characters (@, #, $, etc.), you must URL-encode them.');
      console.log('Example: "p@ssword" -> "p%40ssword"');
    }
  } else {
    console.log('✅ Connection successful!', res.rows[0]);
  }
  pool.end();
});
