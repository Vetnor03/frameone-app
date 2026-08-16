// middleware.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { versionedIconPath } from './lib/iconVersion'
import { isShopLocale, SHOP_LANGUAGE_COOKIE } from './shop/language'

const LEGACY_BROWSER_ICON_PATH = /^\/(?:apple-touch-icon(?:-\d+x\d+)?(?:-precomposed)?|android-chrome-\d+x\d+|favicon(?:-\d+x\d+)?|icon-\d+x\d+)\.(?:ico|png|svg)$/

function isDesktopUserAgent(userAgent: string | null) {
  if (!userAgent) return false

  const normalized = userAgent.toLowerCase()
  const isMobileOrTablet = /android|iphone|ipad|ipod|mobile|tablet|blackberry|iemobile|opera mini/.test(normalized)
  if (isMobileOrTablet) return false

  return /windows nt|macintosh|x11|linux x86_64|cros/.test(normalized)
}

function shouldRedirectDesktopRootToShop(request: NextRequest) {
  return (
    request.nextUrl.hostname === 're-mind.no' &&
    request.nextUrl.pathname === '/' &&
    isDesktopUserAgent(request.headers.get('user-agent'))
  )
}

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

  // Browsers may revisit conventional icon URLs long after their HTML metadata
  // has changed. Keep those legacy entry points pinned to the canonical artwork.
  if (LEGACY_BROWSER_ICON_PATH.test(pathname)) {
    return NextResponse.redirect(new URL(versionedIconPath('/AppLogo.png'), request.url), 308)
  }

  if (pathname === '/shop' || pathname.startsWith('/shop/')) {
    const requestedLanguage = searchParams.get('lang')
    const savedLanguage = request.cookies.get(SHOP_LANGUAGE_COOKIE)?.value

    if (!isShopLocale(requestedLanguage)) {
      const url = request.nextUrl.clone()
      url.searchParams.set('lang', isShopLocale(savedLanguage) ? savedLanguage : 'no')
      return NextResponse.redirect(url)
    }

    if (savedLanguage !== requestedLanguage) {
      const response = NextResponse.next({ request })
      response.cookies.set(SHOP_LANGUAGE_COOKIE, requestedLanguage, {
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
        sameSite: 'lax',
      })
      return response
    }
  }

  if (shouldRedirectDesktopRootToShop(request)) {
    const url = request.nextUrl.clone()
    url.pathname = '/shop'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const isLogin = pathname === '/login'
  const isPublic =
    isLogin ||
    pathname === '/shop' ||
    pathname.startsWith('/shop/') ||
    pathname === '/waitlist' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/AppLogo.png' ||
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
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Static image requests are normally excluded above. These conventional
    // browser icon paths must still reach LEGACY_BROWSER_ICON_PATH before the
    // similarly named files in public/ can be selected.
    '/favicon.svg',
    '/favicon-:size.png',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/apple-touch-icon-:size.png',
    '/apple-touch-icon-:size-precomposed.png',
    '/android-chrome-:size.png',
    '/icon-:size.png',
  ],
}
