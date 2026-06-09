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

function waitlistNumberLine(waitlistNumber: number | null) {
  return typeof waitlistNumber === 'number' ? `You are #${waitlistNumber} on the waitlist.` : 'You are on the waitlist.'
}

function buildWaitlistWelcomeEmail(signup: WaitlistWelcomeSignup) {
  const firstName = signup.name?.trim().split(/\s+/)[0] || 'there'
  const waitlistNumberLineText = waitlistNumberLine(signup.waitlist_number)

  const text = [
    `Hi ${firstName},`,
    '',
    'Welcome to RE:MIND.',
    '',
    waitlistNumberLineText,
    '',
    'Thank you for joining us early.',
    '',
    "We'll keep you updated on launch progress, availability, and introductory pricing as we move towards launch.",
    '',
    "In the meantime, we'd love to hear:",
    '',
    'What would you most like to see on your RE:MIND display?',
    '',
    'Best,',
    'Vetle',
    'Founder, RE:MIND',
  ].join('\n')

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.55;max-width:560px;margin:0 auto;padding:24px;">
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Welcome to RE:MIND.</p>
      <p>${escapeHtml(waitlistNumberLineText)}</p>
      <p>Thank you for joining us early.</p>
      <p>We'll keep you updated on launch progress, availability, and introductory pricing as we move towards launch.</p>
      <p>In the meantime, we'd love to hear:</p>
      <p>What would you most like to see on your RE:MIND display?</p>
      <p style="margin-top:28px;">Best,<br />Vetle<br />Founder, RE:MIND</p>
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
