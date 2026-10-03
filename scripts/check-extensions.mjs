import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: false }, connect_timeout: 30 })
const exts = await sql`SELECT name, default_version FROM pg_available_extensions ORDER BY name`
console.log('Available extensions:')
exts.forEach(e => console.log(`  ${e.name} (${e.default_version})`))
const installed = await sql`SELECT extname FROM pg_extension ORDER BY extname`
console.log('\nInstalled:')
installed.forEach(e => console.log(`  ${e.extname}`))
await sql.end()
