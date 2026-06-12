import { Resend } from 'resend'

type WaitlistWelcomeSignup = {
  email: string
  name: string | null
  waitlist_number: number | null
  source?: string | null
}

type WaitlistNotificationSignup = WaitlistWelcomeSignup & {
  id: string
  source: string
  created_at: string
}

type ResendSendResult = {
  data?: { id?: string } | null
  error?: unknown
}

type SubmittedWaitlistFields = Record<string, unknown>

const WAITLIST_SUBJECT = 'Welcome to RE:MIND'
const INTEREST_WAITLIST_SUBJECT = 'Tusen takk for at du meldte interesse for RE:MIND'
const WAITLIST_NOTIFICATION_SUBJECT = 'New RE:MIND waitlist signup'
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

function isInterestSignupSource(source?: string | null) {
  const normalizedSource = source?.trim().toLowerCase()
  return normalizedSource === 'interesse-landing' || normalizedSource === '/interesse'
}

function interestWaitlistPosition(waitlistNumber: number | null) {
  return typeof waitlistNumber === 'number' ? String(waitlistNumber) : 'bekreftet'
}

function buildInterestWaitlistWelcomeEmail(signup: WaitlistWelcomeSignup) {
  const name = signup.name?.trim() || 'der'
  const position = interestWaitlistPosition(signup.waitlist_number)

  const text = [
    `Hei ${name}!`,
    '',
    'Jeg ville bare sende en liten ekstra takk for at du skrev deg opp på interesselisten til RE:MIND.',
    '',
    `Du er nummer ${position} på interesselisten.`,
    '',
    'Du er faktisk blant de aller første som har meldt interesse, og det betyr mye. RE:MIND er fortsatt under utvikling, så akkurat nå handler det om å finne ut om dette er noe flere familier faktisk kunne hatt glede av hjemme.',
    '',
    'Jeg bygger dette fra Stavanger, først fordi jeg selv ville få med meg små viktige ting i hverdagen uten å måtte sjekke mobilen hele tiden — vær, påminnelser, kalender og etter hvert koble til tjenester du allerede bruker.',
    '',
    'Jeg kommer ikke til å spamme deg. Du får bare noen få oppdateringer om utviklingen, lansering og et tidlig introduksjonstilbud når vi nærmer oss.',
    '',
    'Tusen takk igjen for at du ble med så tidlig.',
    '',
    'Hilsen',
    '',
    'Vetle',
    'Grunnlegger av RE:MIND',
  ].join('\n')

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.55;max-width:560px;margin:0 auto;padding:24px;">
      <p>Hei ${escapeHtml(name)}!</p>
      <p>Jeg ville bare sende en liten ekstra takk for at du skrev deg opp på interesselisten til RE:MIND.</p>
      <p>Du er nummer ${escapeHtml(position)} på interesselisten.</p>
      <p>Du er faktisk blant de aller første som har meldt interesse, og det betyr mye. RE:MIND er fortsatt under utvikling, så akkurat nå handler det om å finne ut om dette er noe flere familier faktisk kunne hatt glede av hjemme.</p>
      <p>Jeg bygger dette fra Stavanger, først fordi jeg selv ville få med meg små viktige ting i hverdagen uten å måtte sjekke mobilen hele tiden — vær, påminnelser, kalender og etter hvert koble til tjenester du allerede bruker.</p>
      <p>Jeg kommer ikke til å spamme deg. Du får bare noen få oppdateringer om utviklingen, lansering og et tidlig introduksjonstilbud når vi nærmer oss.</p>
      <p>Tusen takk igjen for at du ble med så tidlig.</p>
      <p style="margin-top:28px;">Hilsen</p>
      <p>Vetle<br />Grunnlegger av RE:MIND</p>
    </div>
  `

  return { text, html }
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

function formatSubmittedValue(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable value]'
  }
}

function buildSubmittedFieldsLines(submittedFields: SubmittedWaitlistFields) {
  return Object.entries(submittedFields)
    .filter(([key]) => !['email', 'name'].includes(key.toLowerCase()))
    .map(([key, value]) => [key, formatSubmittedValue(value)] as const)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
}

function buildWaitlistNotificationEmail(
  signup: WaitlistNotificationSignup,
  submittedFields: SubmittedWaitlistFields = {},
) {
  const timestamp = signup.created_at || new Date().toISOString()
  const name = signup.name?.trim() || 'Not provided'
  const additionalFieldLines = buildSubmittedFieldsLines({
    source: signup.source,
    waitlist_number: signup.waitlist_number,
    ...submittedFields,
  })

  const text = [
    'Someone just signed up to the RE:MIND waitlist.',
    '',
    `Email: ${signup.email}`,
    `Name: ${name}`,
    `Time: ${timestamp}`,
    ...(additionalFieldLines.length ? ['', 'Submitted fields:', ...additionalFieldLines] : []),
    '',
    'This is an internal notification.',
  ].join('\n')

  const submittedFieldsHtml = additionalFieldLines.length
    ? `<p><strong>Submitted fields:</strong></p><ul>${additionalFieldLines
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join('')}</ul>`
    : ''

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.55;max-width:560px;margin:0 auto;padding:24px;">
      <p>Someone just signed up to the RE:MIND waitlist.</p>
      <p>
        <strong>Email:</strong> ${escapeHtml(signup.email)}<br />
        <strong>Name:</strong> ${escapeHtml(name)}<br />
        <strong>Time:</strong> ${escapeHtml(timestamp)}
      </p>
      ${submittedFieldsHtml}
      <p>This is an internal notification.</p>
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
  const isInterestSignup = isInterestSignupSource(signup.source)
  const { text, html } = isInterestSignup
    ? buildInterestWaitlistWelcomeEmail(signup)
    : buildWaitlistWelcomeEmail(signup)
  const replyTo = process.env.WAITLIST_REPLY_TO?.trim() || DEFAULT_REPLY_TO
  const subject = isInterestSignup ? INTEREST_WAITLIST_SUBJECT : WAITLIST_SUBJECT

  try {
    const result = (await resend.emails.send({
      from: WAITLIST_SENDER,
      to: [signup.email],
      replyTo,
      subject,
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

export async function sendWaitlistNotificationEmail(
  signup: WaitlistNotificationSignup,
  submittedFields: SubmittedWaitlistFields = {},
) {
  const apiKey = process.env.RESEND_API_KEY
  const notifyEmail = process.env.WAITLIST_NOTIFY_EMAIL?.trim()

  // Internal/private notification only: the waitlist user is never included as a recipient,
  // CC, or BCC, and notification details are not returned to the frontend.
  if (!notifyEmail) {
    console.warn('[waitlist] Skipping internal notification because WAITLIST_NOTIFY_EMAIL is not configured.', {
      emailDomain: signup.email.split('@')[1] || 'unknown',
      waitlistNumber: signup.waitlist_number,
    })
    return
  }

  if (!apiKey) {
    console.warn('[waitlist] Skipping internal notification because RESEND_API_KEY is not configured.', {
      emailDomain: signup.email.split('@')[1] || 'unknown',
      waitlistNumber: signup.waitlist_number,
    })
    return
  }

  try {
    const resend = new Resend(apiKey)
    const { text, html } = buildWaitlistNotificationEmail(signup, submittedFields)
    const result = (await resend.emails.send({
      from: WAITLIST_SENDER,
      to: [notifyEmail],
      subject: WAITLIST_NOTIFICATION_SUBJECT,
      text,
      html,
    })) as ResendSendResult

    if (!result.error) {
      console.info('[waitlist] Internal notification email sent.', {
        emailDomain: signup.email.split('@')[1] || 'unknown',
        from: WAITLIST_SENDER,
        resendId: result.data?.id || null,
        waitlistNumber: signup.waitlist_number,
      })
      return
    }

    console.error('[waitlist] Failed to send internal notification email.', {
      emailDomain: signup.email.split('@')[1] || 'unknown',
      waitlistNumber: signup.waitlist_number,
      error: result.error,
    })
  } catch (error) {
    console.error('[waitlist] Failed to send internal notification email.', {
      emailDomain: signup.email.split('@')[1] || 'unknown',
      waitlistNumber: signup.waitlist_number,
      error,
    })
  }
}
