import { pilotCombinationPhoto } from '@/app/lib/pilotCombinationPhotos'
import {
  pilotFrameNames,
  pilotMatteNames,
  type PilotFrameId,
  type SelectablePilotMatteId,
} from '@/app/lib/pilotSelection'

const SENDER = 'RE:MIND <login@re-mind.no>'
const REPLY_TO = 'vetlecn@live.no'
const SUBJECT = 'RE:MIND – rammevalget ditt er registrert'

function escapeHtml(input: string) {
  return input.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export type PilotSelectionEmailDetails = {
  fullName: string
  frameId: PilotFrameId
  matteId: SelectablePilotMatteId
  testMode?: boolean
}

export function buildPilotSelectionConfirmationEmail({
  fullName, frameId, matteId, testMode = false,
}: PilotSelectionEmailDetails) {
  const firstName = fullName.trim().split(/\s+/)[0] || ''
  const greeting = firstName ? 'Hei ' + firstName + '!' : 'Hei!'
  const frameName = pilotFrameNames[frameId]
  const matteName = pilotMatteNames[matteId]
  // This is the exact, photographed combination used by the pilot picker.
  // Fixed trusted origin and controlled allowlisted file mapping; no user URL.
  const photoPath = pilotCombinationPhoto(frameId, matteId)
  if (!photoPath) throw new Error('The selected pilot combination has no photograph.')
  const photoUrl = new URL(photoPath, 'https://re-mind.no').toString()
  const subject = (testMode ? '[TEST] ' : '') + SUBJECT

  const text = [
    ...(testMode ? ['TEST – denne e-posten bekrefter ingen faktisk pilotbestilling.', ''] : []),
    greeting,
    '',
    'Takk for at du har valgt hvordan din RE:MIND skal se ut!',
    '',
    'Vi har registrert dette rammevalget for pilottesten:',
    'Ramme: ' + frameName,
    'Passepartout: ' + matteName,
    '',
    'Se bilde av kombinasjonen: ' + photoUrl,
    'Farger på skjerm kan avvike litt fra de fysiske materialene.',
    '',
    'Du trenger ikke gjøre noe mer nå. Vi tar kontakt med praktisk informasjon når rammen er klar for utsendelse.',
    '',
    'Som avtalt er dette et kostnadsfritt lån i pilottesten. RE:MIND skal returneres ved forespørsel eller når testperioden er over.',
    '',
    'Tusen takk for at du vil være med og hjelpe oss å utvikle RE:MIND!',
    '',
    'Hilsen',
    'Vetle',
    'RE:MIND',
    '',
    'Har du spørsmål? Svar gjerne på denne e-posten.',
  ].join('\n')

  const html = [
    '<div style="margin:0;padding:32px 12px;background:#f3f1ec;font-family:Arial,Helvetica,sans-serif;color:#242522">',
    '<div style="margin:0 auto;max-width:540px;border:1px solid #e2e0d9;border-radius:16px;background:#fcfbf8;padding:26px">',
    '<p style="margin:0 0 30px;font-size:19px;font-weight:600;letter-spacing:.16em">RE:MIND</p>',
    ...(testMode ? ['<p style="padding:10px 12px;background:#e8e5dc;border-radius:7px;font-size:12px">TEST – ingen faktisk pilotbestilling er opprettet.</p>'] : []),
    '<p style="font-size:14px">' + escapeHtml(greeting) + '</p>',
    '<h1 style="font-size:27px;line-height:1.18;font-weight:500;letter-spacing:-.03em;margin:16px 0">Rammevalget ditt er registrert.</h1>',
    '<p style="font-size:14px;line-height:1.7;color:#595a54">Takk for at du har valgt hvordan din RE:MIND skal se ut! Her er kombinasjonen du har valgt til pilottesten.</p>',
    '<div style="margin:24px 0;padding:10px;background:#fff;border:1px solid #e5e3dd;border-radius:12px">',
    '<img src="' + escapeHtml(photoUrl) + '" alt="' + escapeHtml(frameName + ' med ' + matteName + ' passepartout') + '" width="480" height="360" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:6px" />',
    '</div>',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">',
    '<tr><td style="border-top:1px solid #e6e4dd;padding:13px 0;color:#8a8c85">Ramme</td><td style="border-top:1px solid #e6e4dd;padding:13px 0;text-align:right;font-weight:600">' + escapeHtml(frameName) + '</td></tr>',
    '<tr><td style="border-top:1px solid #e6e4dd;border-bottom:1px solid #e6e4dd;padding:13px 0;color:#8a8c85">Passepartout</td><td style="border-top:1px solid #e6e4dd;border-bottom:1px solid #e6e4dd;padding:13px 0;text-align:right;font-weight:600">' + escapeHtml(matteName) + '</td></tr>',
    '</table>',
    '<p style="font-size:11px;line-height:1.6;color:#93948e;margin-top:10px">Farger på skjerm kan avvike litt fra de fysiske materialene.</p>',
    '<p style="font-size:14px;line-height:1.7;margin-top:24px">Du trenger ikke gjøre noe mer nå. Vi tar kontakt med praktisk informasjon når rammen er klar for utsendelse.</p>',
    '<p style="font-size:13px;line-height:1.7;color:#666862">Som avtalt er dette et kostnadsfritt lån i pilottesten. RE:MIND skal returneres ved forespørsel eller når testperioden er over.</p>',
    '<p style="font-size:14px;line-height:1.7;margin-top:24px">Tusen takk for at du vil være med og hjelpe oss å utvikle RE:MIND!<br><br>Hilsen<br>Vetle<br>RE:MIND</p>',
    '<p style="margin-top:26px;padding-top:18px;border-top:1px solid #e2e0d9;font-size:12px;color:#777870">Har du spørsmål? Svar gjerne på denne e-posten.</p>',
    '</div></div>',
  ].join('')

  return { subject, text, html, photoUrl }
}

export async function sendPilotSelectionConfirmationEmail({
  fullName, email, frameId, matteId, testMode = false, idempotencyKey,
}: PilotSelectionEmailDetails & { email: string; idempotencyKey: string }): Promise<{ sent: boolean; resendId: string | null }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, resendId: null }
  const { subject, html, text } = buildPilotSelectionConfirmationEmail({ fullName, frameId, matteId, testMode })
  try {
    // Resend API's native Idempotency-Key header avoids duplicate test emails.
    // This project's pinned resend SDK typing does not expose the second send option.
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ from: SENDER, to: [email], reply_to: REPLY_TO, subject, text, html }),
      cache: 'no-store',
    })
    const result = await response.json().catch(() => null) as { id?: string; name?: string } | null
    if (!response.ok || !result?.id) {
      console.error('[pilot-selection-email] Provider failed to send.', { status: response.status, code: result?.name })
      return { sent: false, resendId: null }
    }
    return { sent: true, resendId: result.id }
  } catch (error) {
    console.error('[pilot-selection-email] Unexpected send failure.', { error })
    return { sent: false, resendId: null }
  }
}
