import { Resend } from 'resend'

export type IntegrationRequestForNotification = {
  id: string
  app_name: string
  note: string | null
  created_at: string
}

const SENDER = 'RE:MIND <login@re-mind.no>'

export async function sendIntegrationRequestNotification(request: IntegrationRequestForNotification): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const recipient = process.env.INTEGRATION_REQUEST_NOTIFY_EMAIL?.trim()

  // This is an internal notification. Neither the recipient nor the email
  // delivery result is included in responses to users.
  if (!apiKey || !recipient) {
    console.error('[integration-requests] Notification email is not configured.', {
      requestId: request.id,
      missingApiKey: !apiKey,
      missingRecipient: !recipient,
    })
    return false
  }

  const text = [
    'A user requested a new RE:MIND Connect integration.',
    '',
    `App: ${request.app_name}`,
    `Requested at: ${request.created_at}`,
    `Request ID: ${request.id}`,
    '',
    'Use case / note:',
    request.note || '(not provided)',
    '',
    'Review in Supabase: public.integration_requests',
    'This is an internal notification, not a message to the requester.',
  ].join('\n')

  try {
    const { data, error } = await new Resend(apiKey).emails.send({
      from: SENDER,
      to: [recipient],
      subject: `RE:MIND – new integration request: ${request.app_name}`,
      text,
    })
    if (error || !data?.id) {
      console.error('[integration-requests] Could not send notification.', {
        requestId: request.id,
        error,
      })
      return false
    }
    console.info('[integration-requests] Notification accepted by mail provider.', {
      requestId: request.id,
      resendId: data.id,
    })
    return true
  } catch (error) {
    console.error('[integration-requests] Could not send notification.', {
      requestId: request.id,
      error,
    })
    return false
  }
}
