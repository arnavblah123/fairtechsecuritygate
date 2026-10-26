// Outgoing email. One of these, set in Vercel -> Settings -> Environment Variables:
//   GATE_GMAIL_USER + GATE_GMAIL_APP_PASSWORD   a Gmail account and its 16-letter app password (simplest)
//   GATE_SMTP_URL                               any SMTP server, e.g. smtps://user:pass@smtp.example.com:465
//   GATE_RESEND_API_KEY + GATE_MAIL_FROM        Resend (needs a verified sender domain)
// GATE_MAIL_FROM sets the sender for all three (default: the Gmail address).
// Local dev / tests: GATE_MAIL_DIR writes each email as a file instead of sending it.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSmtpUrl, smtpSend, type SmtpConfig } from './smtp.js'

export interface Mail { to: string[]; subject: string; html: string; text: string }
export type MailResult = { ok: true } | { ok: false; error: string }

export function mailMode(): 'gmail' | 'smtp' | 'resend' | 'dir' | null {
  const e = process.env
  if (e.GATE_GMAIL_USER && e.GATE_GMAIL_APP_PASSWORD) return 'gmail'
  if (e.GATE_SMTP_URL) return 'smtp'
  if (e.GATE_RESEND_API_KEY && e.GATE_MAIL_FROM) return 'resend'
  if (e.GATE_MAIL_DIR) return 'dir'
  return null
}

function sender(): string {
  const e = process.env
  return e.GATE_MAIL_FROM || (e.GATE_GMAIL_USER ? `Fairtech Gate <${e.GATE_GMAIL_USER}>` : 'Fairtech Gate <gate@localhost>')
}

/** Split "a@x.com, b@y.com" into clean addresses. */
export function parseRecipients(s: string | null | undefined): string[] {
  return (s ?? '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s`)), ms))])

function smtpConfig(): SmtpConfig {
  const e = process.env
  if (mailMode() === 'gmail') {
    return { host: 'smtp.gmail.com', port: 465, secure: true, user: e.GATE_GMAIL_USER!.trim(), pass: (e.GATE_GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, '') }
  }
  return parseSmtpUrl(e.GATE_SMTP_URL!)
}

/** Send one email. Never throws: a failure comes back as { ok: false, error }. */
export async function sendMail(m: Mail): Promise<MailResult> {
  const mode = mailMode()
  if (!mode) return { ok: false, error: 'email not configured (set GATE_GMAIL_USER and GATE_GMAIL_APP_PASSWORD)' }
  if (m.to.length === 0) return { ok: false, error: 'no recipient email set for this unit' }
  try {
    if (mode === 'dir') {
      const dir = process.env.GATE_MAIL_DIR!
      mkdirSync(dir, { recursive: true })
      const file = join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`)
      writeFileSync(file, JSON.stringify({ from: sender(), ...m }, null, 2))
      return { ok: true }
    }
    if (mode === 'resend') {
      const r = await withTimeout(fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GATE_RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: sender(), to: m.to, subject: m.subject, html: m.html, text: m.text }),
      }), 10_000)
      if (!r.ok) return { ok: false, error: `resend ${r.status}: ${(await r.text()).slice(0, 300)}` }
      return { ok: true }
    }
    await withTimeout(smtpSend(smtpConfig(), { from: sender(), to: m.to, subject: m.subject, html: m.html, text: m.text }), 15_000)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 500) }
  }
}
