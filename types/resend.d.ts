declare module 'resend' {
  export class Resend {
    constructor(apiKey?: string)
    emails: {
      send(input: {
        from: string
        to: string | string[]
        replyTo?: string | string[]
        subject: string
        text?: string
        html?: string
      }): Promise<{ data?: { id?: string } | null; error?: unknown }>
    }
  }
}
