import nodemailer, { type Transporter } from 'nodemailer'
import { config } from '../config'

let transporter: Transporter | null = null

/** SMTP configured: features that send e-mails (password reset) are on. */
export const isMailEnabled = () => !!config.SMTP_URL

/**
 * Sends a plain-text e-mail through SMTP_URL (`smtps://…:465`, or `smtp://…:587` upgraded with STARTTLS).
 * requireTLS: a server without STARTTLS fails instead of receiving the credentials and the reset link in clear.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  transporter ??= nodemailer.createTransport({ url: config.SMTP_URL, requireTLS: true })
  await transporter.sendMail({ from: config.SMTP_FROM, to, subject, text })
}
