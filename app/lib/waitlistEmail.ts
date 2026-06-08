import { Resend } from 'resend'

type WaitlistWelcomeSignup = {
  email: string
  name: string | null
  waitlist_number: number | null
}

type ResendSendResult = {
  data?: { id?: string } | null
  error?: unknown
}

const WAITLIST_SUBJECT = 'Welcome to RE:MIND'
const WAITLIST_SENDER = 'RE:MIND <login@re-mind.no>'
const DEFAULT_REPLY_TO = 'vetlecn@live.no'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function waitlistPositionText(waitlistNumber: number | null) {
  return typeof waitlistNumber === 'number' ? `#${waitlistNumber}` : 'on the waitlist'
}

function buildWaitlistWelcomeEmail(signup: WaitlistWelcomeSignup) {
  const firstName = signup.name?.trim().split(/\s+/)[0]
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,'
  const position = waitlistPositionText(signup.waitlist_number)

  const text = [
    greeting,
    '',
    `Welcome to RE:MIND — you are ${position}.`,
    '',
    'Thank you for joining the waitlist. We will keep you posted on launch updates, availability, and introductory pricing.',
    '',
    'Best,',
    'The RE:MIND team',
  ].join('\n')

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.55;max-width:560px;margin:0 auto;padding:24px;">
      <p>${escapeHtml(greeting)}</p>
      <p>Welcome to <strong>RE:MIND</strong> — you are <strong>${escapeHtml(position)}</strong>.</p>
      <p>Thank you for joining the waitlist. We’ll keep you posted on launch updates, availability, and introductory pricing.</p>
      <p style="margin-top:28px;">Best,<br />The RE:MIND team</p>
    </div>
  `

  return { text, html }
}

export async function sendWaitlistWelcomeEmail(signup: WaitlistWelcomeSignup) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[waitlist] Skipping welcome email because RESEND_API_KEY is not configured.', {
      emailDomain: signup.email.split('@')[1] || 'unknown',
      waitlistNumber: signup.waitlist_number,
    })
    return
  }

  const resend = new Resend(apiKey)
  const { text, html } = buildWaitlistWelcomeEmail(signup)
  const replyTo = process.env.WAITLIST_REPLY_TO?.trim() || DEFAULT_REPLY_TO

  try {
    const result = (await resend.emails.send({
      from: WAITLIST_SENDER,
      to: [signup.email],
      replyTo,
      subject: WAITLIST_SUBJECT,
      text,
      html,
    })) as ResendSendResult

    if (!result.error) {
      console.info('[waitlist] Welcome email sent.', {
        emailDomain: signup.email.split('@')[1] || 'unknown',
        from: WAITLIST_SENDER,
        resendId: result.data?.id || null,
        waitlistNumber: signup.waitlist_number,
      })
      return
    }

    console.error('[waitlist] Failed to send welcome email.', {
      emailDomain: signup.email.split('@')[1] || 'unknown',
      waitlistNumber: signup.waitlist_number,
      error: result.error,
    })
  } catch (error) {
    console.error('[waitlist] Failed to send welcome email.', {
      emailDomain: signup.email.split('@')[1] || 'unknown',
      waitlistNumber: signup.waitlist_number,
      error,
    })
  }
}
