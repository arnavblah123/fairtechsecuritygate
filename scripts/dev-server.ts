export {}
// Local API server: PGlite database + photos in a folder. `npm run dev` starts this and Vite together.
process.env.PGLITE_DIR ??= '.local/pglite'
process.env.STORAGE_DIR ??= '.local/photos'
process.env.GATE_JWT_SECRET ??= 'local-dev-secret-not-for-production'
const port = Number(process.env.API_PORT ?? 8787)

const { serve } = await import('@hono/node-server')
const { app } = await import('../api/_lib/app.js')
const { db } = await import('../api/_lib/db.js')
await db()
serve({ fetch: app.fetch, port }, () => console.log(`API on http://localhost:${port}/api (PGlite at ${process.env.PGLITE_DIR})`))
