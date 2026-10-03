import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, connect_timeout: 30 })
const r = await sql`SELECT version()`
console.log(r[0].version)
await sql.end()
