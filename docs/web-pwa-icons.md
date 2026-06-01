# Web/PWA PNG icon setup

The web app icon source is the manually uploaded PNG at:

```text
public/AppIcon-1024v2.png
```

Do not regenerate or replace committed PNG/icon files for this icon refresh. The app metadata, favicon redirect, and PWA manifest point directly at this uploaded file through the shared icon constants in `app/lib/iconVersion.ts`.

## Currently used web/PWA icon paths

These are the icon URL paths referenced by the web app metadata and manifest:

| Purpose | URL path used by the app | Repository file |
| --- | --- | --- |
| Browser favicon metadata | `/AppIcon-1024v2.png?v=remind-app-icon-20260601` | `public/AppIcon-1024v2.png` |
| Legacy `/favicon.ico` redirect | `/AppIcon-1024v2.png?v=remind-app-icon-20260601` | `public/AppIcon-1024v2.png` |
| Web app icon metadata | `/AppIcon-1024v2.png?v=remind-app-icon-20260601` | `public/AppIcon-1024v2.png` |
| Apple web app metadata | `/AppIcon-1024v2.png?v=remind-app-icon-20260601` | `public/AppIcon-1024v2.png` |
| PWA manifest icon, `any` | `/AppIcon-1024v2.png?v=remind-app-icon-20260601` | `public/AppIcon-1024v2.png` |
| PWA manifest icon, `maskable` | `/AppIcon-1024v2.png?v=remind-app-icon-20260601` | `public/AppIcon-1024v2.png` |

## Notes

The older generated icon files remain in `public/` for compatibility, but they are no longer referenced by the web metadata, favicon redirect, or PWA manifest. Startup/splash rendering logic is intentionally unchanged.
