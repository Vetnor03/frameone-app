import { Resend } from 'resend'

type NewsletterWelcome = {
  email: string
  unsubscribeToken: string
  siteUrl: string
}

const NEWSLETTER_SENDER = 'RE:MIND <login@re-mind.no>'

export async function sendNewsletterWelcomeEmail({
  email,
  unsubscribeToken,
  siteUrl,
}: NewsletterWelcome) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[newsletter] Skipping welcome email because RESEND_API_KEY is not configured.')
    return false
  }

  const unsubscribeUrl = new URL('/api/shop/newsletter/unsubscribe', siteUrl)
  unsubscribeUrl.searchParams.set('token', unsubscribeToken)

  const text = [
    'Thank you for joining the RE:MIND newsletter!',
    '',
    'You are now on the list for new frames, product updates and ideas from RE:MIND.',
    '',
    'We will only email when we have something worth sharing.',
    '',
    `Unsubscribe at any time: ${unsubscribeUrl.toString()}`,
  ].join('\n')

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.55;max-width:560px;margin:0 auto;padding:24px;">
      <p>Thank you for joining the RE:MIND newsletter!</p>
      <p>You are now on the list for new frames, product updates and ideas from RE:MIND.</p>
      <p>We will only email when we have something worth sharing.</p>
      <p style="margin-top:28px;">
        <a href="${unsubscribeUrl.toString()}" style="display:inline-block;border:1px solid #111;border-radius:4px;padding:10px 16px;color:#111;text-decoration:none;">Unsubscribe</a>
      </p>
    </div>
  `

  try {
    const result = await new Resend(apiKey).emails.send({
      from: NEWSLETTER_SENDER,
      to: [email],
      replyTo: process.env.NEWSLETTER_REPLY_TO?.trim() || 'vetlecn@live.no',
      subject: 'Thank you for joining the RE:MIND newsletter',
      text,
      html,
    })

    if (result.error) {
      console.error('[newsletter] Welcome email failed.', { error: result.error })
      return false
    }

    return true
  } catch (error) {
    console.error('[newsletter] Welcome email failed.', { error })
    return false
  }
}
