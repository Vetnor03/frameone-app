type WaitlistWelcomeEmail = {
  email: string
  name?: string | null
  productInterest?: string | null
}

export async function sendWaitlistWelcomeEmail({ email, productInterest }: WaitlistWelcomeEmail) {
  // TODO: Connect an email provider such as Resend, Postmark, or Supabase Edge Functions.
  // Subject: Welcome to the RE:MIND waitlist
  // Body:
  // Thanks for signing up.
  //
  // You're now among the first to get RE:MIND updates ahead of launch.
  //
  // We currently plan to launch in autumn 2026.
  //
  // Best,
  // RE:MIND
  console.info('Waitlist welcome email pending provider configuration', { email, productInterest })
}
