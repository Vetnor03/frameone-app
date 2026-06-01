# Web/PWA PNG icon setup

The web app uses standard PNG icon assets for the favicon, Apple touch icon, and PWA manifest. Do **not** use SVG assets for launcher/app branding because SVG favicon and PWA icon handling can render and cache inconsistently across browsers and install surfaces.

## Source artwork

The PNG artwork in `public/` preserves the current Re-mind app icon branding and proportions. Do not redesign the logo when updating these assets.

The native iOS source remains documented separately at:

```text
ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
```

Do not modify the native iOS app icon asset catalog when updating web/PWA icons.

## Currently used web/PWA icon paths

These are the icon URL paths referenced by the web app metadata and manifest:

| Purpose | URL path used by the app | Repository file |
| --- | --- | --- |
| Browser favicon metadata | `/favicon-32x32.png?v=remind-app-icon-20260511` | `public/favicon-32x32.png` |
| Legacy `/favicon.ico` redirect | `/favicon-32x32.png?v=remind-app-icon-20260511` | `public/favicon-32x32.png` |
| Web app icon metadata, 192px | `/icon-192x192.png?v=remind-app-icon-20260511` | `public/icon-192x192.png` |
| Web app icon metadata, 512px | `/icon-512x512.png?v=remind-app-icon-20260511` | `public/icon-512x512.png` |
| Apple web app metadata | `/apple-touch-icon.png?v=remind-app-icon-20260511` | `public/apple-touch-icon.png` |
| PWA manifest icon, `any`, 192px | `/icon-192x192.png?v=remind-app-icon-20260511` | `public/icon-192x192.png` |
| PWA manifest icon, `any`, 512px | `/icon-512x512.png?v=remind-app-icon-20260511` | `public/icon-512x512.png` |
| PWA manifest icon, `maskable`, 192px | `/android-chrome-192x192.png?v=remind-app-icon-20260511` | `public/android-chrome-192x192.png` |
| PWA manifest icon, `maskable`, 512px | `/android-chrome-512x512.png?v=remind-app-icon-20260511` | `public/android-chrome-512x512.png` |
| In-app launch splash branding | `/icon-512x512.png` | `public/icon-512x512.png` |

## Files to update

When the Re-mind web/PWA icon changes, update these existing PNG files together:

```text
public/favicon-32x32.png
public/apple-touch-icon.png
public/icon-192x192.png
public/icon-512x512.png
public/android-chrome-192x192.png
public/android-chrome-512x512.png
```

Keep all PNGs aligned to the same final Re-mind logo artwork and proportions. Do not redesign the logo and do not reintroduce SVG icon references for favicon, Apple touch, manifest, launcher, or app branding surfaces.
