// Vercel entry: one serverless function for the whole API (vercel.json rewrites /api/* here).
import type { IncomingMessage, ServerResponse } from 'node:http'
import { app } from './_lib/app.js'

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const url = `${proto}://${req.headers.host}${req.url}`
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue
    headers.set(k, Array.isArray(v) ? v.join(', ') : v)
  }
  let body: BodyInit | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const b = req.body
    if (b !== undefined && b !== null) body = Buffer.isBuffer(b) ? Uint8Array.from(b) : typeof b === 'string' ? b : JSON.stringify(b)
    else {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      body = Uint8Array.from(Buffer.concat(chunks))
    }
  }
  const response = await app.fetch(new Request(url, { method: req.method, headers, body }))
  res.statusCode = response.status
  response.headers.forEach((v, k) => res.setHeader(k, v))
  res.end(Buffer.from(await response.arrayBuffer()))
}
