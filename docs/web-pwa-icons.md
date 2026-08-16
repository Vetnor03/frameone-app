# Web/PWA app icon setup

The external web app icon uses the source artwork at:

```text
public/AppLogo.png
```

The browser favicon metadata, legacy `/favicon.ico` redirect, Apple touch icon
metadata, PWA manifest (including its maskable entry), and web push notification
icon all point directly to `/AppLogo.png`. A version query supplied by
`app/lib/iconVersion.ts` invalidates cached metadata icons when the artwork
changes.

Middleware also redirects conventional legacy favicon, Apple touch, Android
Chrome, and numbered icon URLs to the versioned `/AppLogo.png`. This prevents
browser caches and automatic icon discovery from continuing to serve the old
static files while leaving those binary assets untouched.

Do not use this app-icon setup to replace logos rendered in pages, splash UI, or
the public shop. Those are separate branding surfaces. No generated web PNG
variants are required or maintained in this repository.

The native iOS app icon is documented separately in `docs/ios-app-icon.md`.
