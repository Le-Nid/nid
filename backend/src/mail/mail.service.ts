import nodemailer, { type Transporter } from 'nodemailer'
import { config } from '../config'

let transporter: Transporter | null = null

/** SMTP configured: features that send e-mails (password reset) are on. */
export const isMailEnabled = () => !!config.SMTP_URL

/** Sends a plain-text e-mail through SMTP_URL (e.g. `smtps://user:pass@smtp.example.com:465`). */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  transporter ??= nodemailer.createTransport(config.SMTP_URL)
  await transporter.sendMail({ from: config.SMTP_FROM, to, subject, text })
}
