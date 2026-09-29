import { Resend } from 'resend'
import { PILOT_DEADLINE_LABEL } from '@/app/lib/pilotApplicationDeadline'

const PILOT_EMAIL_FROM = 'RE:MIND <login@re-mind.no>'
const PILOT_REPLY_TO = 'vetlecn@live.no'
const PILOT_EMAIL_SUBJECT = 'Takk for interessen for RE:MIND – vi har mottatt påmeldingen din'

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export async function sendPilotApplicationConfirmation({
  fullName, email,
}: { fullName: string; email: string }): Promise<{ sent: boolean; resendId: string | null }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[pilot-applications] Confirmation email unavailable: RESEND_API_KEY is missing.')
    return { sent: false, resendId: null }
  }

  const firstName = fullName.trim().split(/\s+/)[0] || ''
  const greeting = firstName ? `Hei ${firstName}!` : 'Hei!'
  const text = [
    greeting,
    '',
    'Tusen takk for at du meldte interesse for å bli en av de første som tester RE:MIND!',
    '',
    'Vi har mottatt påmeldingen din. Svarfristen er ' + PILOT_DEADLINE_LABEL + '.',
    '',
    'Når fristen er ute går vi gjennom søknadene. Du hører fra oss når vi nærmer oss pilottesten. Dersom du blir valgt ut, får du mer informasjon om testperioden og vilkårene før du eventuelt takker ja.',
    '',
    'Dette er kun en påmelding, ikke en bestilling eller en bekreftelse på at du er valgt som testbruker.',
    '',
    'Takk for at du vil være med på utviklingen!',
    '',
    'Hilsen',
    'Vetle',
    'RE:MIND',
    '',
    'Spørsmål? Svar gjerne på denne e-posten.',
  ].join('\n')

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f3f1ec;padding:32px 12px;color:#242522">
      <div style="margin:0 auto;max-width:540px;background:#fcfbf8;border:1px solid #e2e0d9;border-radius:16px;padding:30px">
        <p style="font-size:18px;font-weight:600;letter-spacing:.15em;margin:0 0 32px">RE:MIND</p>
        <p>${escapeHtml(greeting)}</p>
        <h1 style="font-size:26px;line-height:1.2;font-weight:500;letter-spacing:-.03em;margin:16px 0">Takk for interessen!</h1>
        <p style="line-height:1.6">Tusen takk for at du meldte interesse for å bli en av de første som tester RE:MIND. Vi har mottatt påmeldingen din.</p>
        <p style="line-height:1.6"><strong>Svarfrist: ${PILOT_DEADLINE_LABEL}.</strong></p>
        <p style="line-height:1.6">Når fristen er ute går vi gjennom søknadene. Du hører fra oss når vi nærmer oss pilottesten. Dersom du blir valgt ut, får du mer informasjon om testperioden og vilkårene før du eventuelt takker ja.</p>
        <p style="font-size:12px;color:#65665e;line-height:1.6">Dette er kun en påmelding, ikke en bestilling eller en bekreftelse på at du er valgt som testbruker.</p>
        <p style="line-height:1.6;margin-top:28px">Takk for at du vil være med på utviklingen!<br><br>Hilsen<br>Vetle<br>RE:MIND</p>
        <p style="border-top:1px solid #e2e0d9;padding-top:18px;font-size:12px;color:#65665e">Har du spørsmål? Svar gjerne på denne e-posten.</p>
      </div>
    </div>`

  try {
    const { data, error } = await new Resend(apiKey).emails.send({
      from: PILOT_EMAIL_FROM,
      to: [email],
      replyTo: PILOT_REPLY_TO,
      subject: PILOT_EMAIL_SUBJECT,
      text,
      html,
    })
    if (error || !data?.id) {
      console.error('[pilot-applications] Failed to send confirmation email.', {
        emailDomain: email.split('@')[1] || 'unknown',
        error,
      })
      return { sent: false, resendId: null }
    }
    return { sent: true, resendId: data.id }
  } catch (error) {
    console.error('[pilot-applications] Failed to send confirmation email.', {
      emailDomain: email.split('@')[1] || 'unknown',
      error,
    })
    return { sent: false, resendId: null }
  }
}
