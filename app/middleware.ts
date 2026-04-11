// middleware.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function createSupabaseServerClient(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Keep request cookies in sync for this middleware run
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))

          // Recreate the response so Next.js sees updated request cookies
          response = NextResponse.next({ request })

          // And set cookies on the outgoing response
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  return { supabase, getResponse: () => response }
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  const isLogin = pathname === '/login'
  const isPublic =
    isLogin ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api')

  const { supabase, getResponse } = createSupabaseServerClient(request)

  // ✅ Validates JWT signature + refreshes session via cookies when needed.
  // Supabase recommends getClaims() for server-side protection. :contentReference[oaicite:3]{index=3}
  const { data } = await supabase.auth.getClaims()
  const isAuthed = !!data?.claims

  // If authed, never show /login
  if (isLogin && isAuthed) {
    const next = searchParams.get('next') || '/'
    const url = request.nextUrl.clone()
    url.pathname = next
    url.search = ''
    return NextResponse.redirect(url)
  }

  // If not authed, protect everything except public routes
  if (!isAuthed && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  // IMPORTANT: return the response object that contains any refreshed cookies
  return getResponse()
}

// Match all routes except static assets handled by Next
export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
