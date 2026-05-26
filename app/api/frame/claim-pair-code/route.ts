import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError('Pairing is temporarily unavailable. Please try again shortly.', 500)
  }

  const body = await request.json().catch(() => null)
  const pairCode = typeof body?.pairCode === 'string' ? body.pairCode.trim().toUpperCase() : ''

  console.info('[frame.claimPairCode] request', {
    pairCodeLength: pairCode.length,
  })

  if (!pairCode || pairCode.length !== 4) {
    return jsonError('Please enter a valid 4-character pair code.')
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options)
        }
      },
    },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  const hasUser = Boolean(userData?.user)

  console.info('[frame.claimPairCode] auth', {
    hasUser,
    userErrorCode: (userError as { code?: string } | null)?.code || null,
    userErrorMessage: userError?.message || null,
  })

  if (!hasUser) {
    return jsonError('You must be logged in to add a frame.', 401)
  }

  const { data, error } = await supabase.rpc('claim_pair_code', { p_code: pairCode })

  console.info('[frame.claimPairCode] rpc', {
    pairCodeLength: pairCode.length,
    rpcErrorCode: (error as { code?: string } | null)?.code || null,
    rpcErrorMessage: error?.message || null,
    rpcData: data === true,
  })

  if (error) {
    const response = jsonError('Could not claim this pair code right now. Please try again.', 500)
    console.info('[frame.claimPairCode] response', { status: response.status })
    return response
  }

  if (data !== true) {
    const response = jsonError('This pair code is invalid, expired, or already used.', 400)
    console.info('[frame.claimPairCode] response', { status: response.status })
    return response
  }

  const response = NextResponse.json({ ok: true }, { status: 200 })
  console.info('[frame.claimPairCode] response', { status: response.status })
  return response
}
