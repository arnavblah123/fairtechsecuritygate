// Minimal SMTP client (no dependencies): implicit TLS on 465 or STARTTLS on 587, AUTH PLAIN / LOGIN,
// UTF-8 multipart/alternative (text + HTML). Enough for Gmail app passwords and ordinary SMTP servers.
import net from 'node:net'
import tls from 'node:tls'
import { randomUUID } from 'node:crypto'

export interface SmtpConfig { host: string; port: number; secure: boolean; user: string; pass: string }
export interface SmtpMessage { from: string; to: string[]; subject: string; text: string; html: string }

/** smtps://user:pass@host:465 (TLS) or smtp://user:pass@host:587 (STARTTLS). */
export function parseSmtpUrl(url: string): SmtpConfig {
  const u = new URL(url)
  const secure = u.protocol === 'smtps:'
  return { host: u.hostname, port: Number(u.port) || (secure ? 465 : 587), secure, user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) }
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
const wrap76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n')
/** RFC 2047 encoded header value when it is not plain ASCII (Hindi names, ⚠). */
const encHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`)
/** "Name <addr>" -> encoded name + address */
function encAddress(a: string): string {
  const m = /^(.*)<([^>]+)>\s*$/.exec(a)
  return m ? `${encHeader(m[1].trim())} <${m[2]}>` : a
}
const bareAddress = (a: string) => (/<([^>]+)>/.exec(a)?.[1] ?? a).trim()

export function buildMime(m: SmtpMessage, host: string): string {
  const boundary = `b_${randomUUID()}`
  const headers = [
    `From: ${encAddress(m.from)}`,
    `To: ${m.to.join(', ')}`,
    `Subject: ${encHeader(m.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${host}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
  const part = (type: string, body: string) => [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', wrap76(b64(body))].join('\r\n')
  return [...headers, '', part('text/plain', m.text), part('text/html', m.html), `--${boundary}--`, ''].join('\r\n')
}

class Conn {
  private buf = ''
  private waiters: ((line: string) => void)[] = []
  private lines: string[] = []
  private err: Error | null = null
  constructor(public sock: net.Socket) { this.attach(sock) }
  attach(sock: net.Socket) {
    this.sock = sock
    sock.setEncoding('utf8')
    sock.on('data', (d: string) => {
      this.buf += d
      let i
      while ((i = this.buf.indexOf('\r\n')) >= 0) {
        const line = this.buf.slice(0, i)
        this.buf = this.buf.slice(i + 2)
        const w = this.waiters.shift()
        if (w) w(line); else this.lines.push(line)
      }
    })
    sock.on('error', (e) => { this.err = e; this.waiters.splice(0).forEach((w) => w(`000 ${e.message}`)) })
  }
  private nextLine(): Promise<string> {
    if (this.err) return Promise.resolve(`000 ${this.err.message}`)
    const l = this.lines.shift()
    return l !== undefined ? Promise.resolve(l) : new Promise((r) => this.waiters.push(r))
  }
  /** Read a (possibly multi-line) reply; throw unless its code is one of `ok`. */
  async reply(ok: number[]): Promise<string> {
    let line = await this.nextLine()
    const all = [line]
    while (/^\d{3}-/.test(line)) { line = await this.nextLine(); all.push(line) }
    const code = Number(line.slice(0, 3))
    if (!ok.includes(code)) throw new Error(`SMTP ${all.join(' | ').slice(0, 300)}`)
    return all.join('\n')
  }
  async cmd(line: string, ok: number[]): Promise<string> {
    this.sock.write(line + '\r\n')
    return this.reply(ok)
  }
}

export async function smtpSend(cfg: SmtpConfig, m: SmtpMessage): Promise<void> {
  const name = 'fairtech-gate'
  const raw = cfg.secure
    ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host })
    : net.connect({ host: cfg.host, port: cfg.port })
  await new Promise<void>((res, rej) => { raw.once(cfg.secure ? 'secureConnect' : 'connect', () => res()); raw.once('error', rej) })
  const c = new Conn(raw)
  try {
    await c.reply([220])
    let ehlo = await c.cmd(`EHLO ${name}`, [250])
    if (!cfg.secure) {
      if (!/STARTTLS/i.test(ehlo)) throw new Error('SMTP server does not offer STARTTLS')
      await c.cmd('STARTTLS', [220])
      raw.removeAllListeners('data')
      const secured = tls.connect({ socket: raw, servername: cfg.host })
      await new Promise<void>((res, rej) => { secured.once('secureConnect', () => res()); secured.once('error', rej) })
      c.attach(secured)
      ehlo = await c.cmd(`EHLO ${name}`, [250])
    }
    if (cfg.user) {
      if (/AUTH[^\n]*PLAIN/i.test(ehlo)) {
        await c.cmd(`AUTH PLAIN ${Buffer.from(`\u0000${cfg.user}\u0000${cfg.pass}`, 'utf8').toString('base64')}`, [235])
      } else {
        await c.cmd('AUTH LOGIN', [334])
        await c.cmd(b64(cfg.user), [334])
        await c.cmd(b64(cfg.pass), [235])
      }
    }
    await c.cmd(`MAIL FROM:<${bareAddress(m.from)}>`, [250])
    for (const to of m.to) await c.cmd(`RCPT TO:<${bareAddress(to)}>`, [250, 251])
    await c.cmd('DATA', [354])
    // dot-stuffing: a line starting with "." gets an extra "."
    const body = buildMime(m, cfg.host).replace(/\r\n\./g, '\r\n..')
    await c.cmd(`${body}\r\n.`, [250])
    await c.cmd('QUIT', [221]).catch(() => undefined)
  } finally {
    c.sock.destroy()
  }
}
