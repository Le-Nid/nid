import { describe, it, expect, vi } from 'vitest'

const sendMail = vi.fn().mockResolvedValue({})
const createTransport = vi.fn(() => ({ sendMail }))
vi.mock('nodemailer', () => ({ default: { createTransport } }))
vi.mock('../config', () => ({ config: { SMTP_URL: 'smtp://u:p@smtp.test:587', SMTP_FROM: 'Nid <nid@test>' } }))

const { sendMail: send, isMailEnabled } = await import('../mail/mail.service')

describe('mail.service', () => {
  it('forces TLS on smtp:// and reuses one transport', async () => {
    expect(isMailEnabled()).toBe(true)
    await send('a@test.com', 'Subject', 'Body')
    await send('b@test.com', 'Subject', 'Body')
    expect(createTransport).toHaveBeenCalledTimes(1)
    expect(createTransport).toHaveBeenCalledWith({ url: 'smtp://u:p@smtp.test:587', requireTLS: true })
    expect(sendMail).toHaveBeenLastCalledWith({ from: 'Nid <nid@test>', to: 'b@test.com', subject: 'Subject', text: 'Body' })
  })
})
