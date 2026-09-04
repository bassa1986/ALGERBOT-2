// Minimal SMTP client built from scratch on Node's built-in `node:tls`
// module only — no nodemailer or any other third-party mail package.
// Speaks plain SMTP over implicit TLS (port 465), which is what Gmail's
// smtp.gmail.com expects. Good enough for the low volume of transactional
// email this app sends (password resets); not a general-purpose mailer.
//
// Gmail specifically requires an "App Password" (Google Account → Security
// → 2-Step Verification → App Passwords), NOT your normal Gmail password —
// Google blocks plain password SMTP auth entirely.

import { connect as tlsConnect, type TLSSocket } from 'node:tls'

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
}

export interface SmtpMessage {
  from: string
  to: string
  subject: string
  html: string
  text: string
}

/** Reads one full SMTP reply (a line, or a multi-line "250-...\r\n250 ..." block) off the socket. */
function readReply(socket: TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      // A reply is complete once we see a line where the 4th char is a
      // space (not '-'), e.g. "250 OK" vs the continuation "250-...".
      const lines = buffer.split('\r\n').filter(Boolean)
      const last = lines[lines.length - 1]
      if (last && /^\d{3} /.test(last)) {
        cleanup()
        resolve(buffer)
      }
    }
    const onError = (err: Error) => {
      cleanup()
      reject(err)
    }
    const cleanup = () => {
      socket.off('data', onData)
      socket.off('error', onError)
    }
    socket.on('data', onData)
    socket.on('error', onError)
  })
}

function expectCode(reply: string, code: string, step: string) {
  if (!reply.startsWith(code)) {
    throw new Error(`SMTP error at ${step}: expected ${code}, got: ${reply.trim()}`)
  }
}

function encodeMimeHeader(value: string): string {
  // Encode non-ASCII header values (e.g. an Arabic/French subject) per
  // RFC 2047, so mail clients decode them correctly instead of showing
  // mojibake. Plain ASCII values pass through unchanged.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

/** Sends one email over a fresh implicit-TLS SMTP connection (connect → send → quit). */
export async function sendSmtpMail(config: SmtpConfig, message: SmtpMessage): Promise<void> {
  const socket = tlsConnect({ host: config.host, port: config.port, servername: config.host })

  await new Promise<void>((resolve, reject) => {
    socket.once('secureConnect', () => resolve())
    socket.once('error', reject)
  })

  try {
    expectCode(await readReply(socket), '220', 'connect')

    const send = (line: string) => {
      socket.write(line + '\r\n')
      return readReply(socket)
    }

    expectCode(await send(`EHLO ${config.host}`), '250', 'EHLO')
    expectCode(await send('AUTH LOGIN'), '334', 'AUTH LOGIN')
    expectCode(await send(Buffer.from(config.user, 'utf8').toString('base64')), '334', 'AUTH LOGIN (user)')
    expectCode(await send(Buffer.from(config.pass, 'utf8').toString('base64')), '235', 'AUTH LOGIN (pass)')

    expectCode(await send(`MAIL FROM:<${message.from}>`), '250', 'MAIL FROM')
    expectCode(await send(`RCPT TO:<${message.to}>`), '250', 'RCPT TO')
    expectCode(await send('DATA'), '354', 'DATA')

    const boundary = `----algerbot-${Date.now().toString(16)}`
    const date = new Date().toUTCString()
    const mime = [
      `From: ${message.from}`,
      `To: ${message.to}`,
      `Subject: ${encodeMimeHeader(message.subject)}`,
      `Date: ${date}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.text,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.html,
      '',
      `--${boundary}--`,
      '.',
    ].join('\r\n')

    expectCode(await send(mime), '250', 'DATA body')
    await send('QUIT')
  } finally {
    socket.end()
    socket.destroy()
  }
}
