// Transactional email sender, built entirely on this project's own
// from-scratch SMTP client (src/lib/smtp.ts) — no external mail package
// or third-party API. Reads SMTP credentials from env vars.
//
// To actually deliver email, set these in .env (see .env.example):
//   EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER, EMAIL_SMTP_PASS,
//   EMAIL_FROM
// For Gmail: host=smtp.gmail.com, port=465, user=your Gmail address,
// pass=an "App Password" (Google Account -> Security -> 2-Step
// Verification -> App Passwords) -- Google rejects your normal account
// password over SMTP entirely.
//
// If EMAIL_SMTP_* env vars aren't set, sendEmail() logs to the console
// instead of throwing -- so local dev and a not-yet-configured deployment
// don't hard-fail, but nothing is silently "sent" for real. If they ARE
// set and the send fails, this throws, since that's a real delivery
// failure the caller should know about.

import { sendSmtpMail } from './smtp'

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const host = process.env.EMAIL_SMTP_HOST
  const port = process.env.EMAIL_SMTP_PORT
  const user = process.env.EMAIL_SMTP_USER
  const pass = process.env.EMAIL_SMTP_PASS
  const from = process.env.EMAIL_FROM || user || 'no-reply@algerbot.local'

  if (!host || !port || !user || !pass) {
    console.warn(
      `[email] EMAIL_SMTP_* env vars not set -- not sending. Would have sent to ${input.to}: "${input.subject}"`,
    )
    return
  }

  await sendSmtpMail(
    { host, port: parseInt(port, 10), user, pass },
    { from, to: input.to, subject: input.subject, html: input.html, text: input.text },
  )
}
