type WaitlistWelcomeEmail = {
  email: string
  name?: string | null
  productInterest?: string | null
}

export async function sendWaitlistWelcomeEmail({ email, productInterest }: WaitlistWelcomeEmail) {
  // TODO: Connect an email provider such as Resend, Postmark, or Supabase Edge Functions.
  // Subject: Velkommen til RE:MIND-ventelisten
  // Body:
  // Takk for at du meldte deg på.
  //
  // Du er nå blant de første som får oppdateringer om RE:MIND frem mot lansering.
  //
  // Vi lanserer etter planen høsten 2026.
  //
  // Hilsen
  // RE:MIND
  console.info('Waitlist welcome email pending provider configuration', { email, productInterest })
}
