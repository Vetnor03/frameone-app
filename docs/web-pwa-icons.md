# Web/PWA SVG icon setup

The web app uses SVG icon assets for the favicon and PWA manifest. Do **not** commit PNG, JPG, or ICO icon assets for the web/PWA icon update.

## Source artwork

The SVG artwork in this repo mirrors the final Re-mind native app icon proportions from:

```text
ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
```

Do not modify the native iOS app icon asset catalog when updating web/PWA icons.

## Currently used web/PWA icon paths

These are the icon URL paths referenced by the web app metadata and manifest:

| Purpose | URL path used by the app | Repository file |
| --- | --- | --- |
| Browser favicon | `/favicon.svg?v=remind-app-icon-20260511` | `public/favicon.svg` |
| Web app icon metadata | `/remind-icon.svg?v=remind-app-icon-20260511` | `public/remind-icon.svg` |
| Apple web app metadata | `/remind-icon.svg?v=remind-app-icon-20260511` | `public/remind-icon.svg` |
| PWA manifest icon, `any` | `/remind-icon.svg?v=remind-app-icon-20260511` | `public/remind-icon.svg` |
| PWA manifest icon, `maskable` | `/remind-icon.svg?v=remind-app-icon-20260511` | `public/remind-icon.svg` |

## Files to update

When the Re-mind web/PWA icon changes, update these existing SVG files only:

```text
public/favicon.svg
public/remind-icon.svg
```

Keep both SVGs aligned to the same final Re-mind logo artwork and proportions. Do not redesign the logo and do not add binary favicon, Apple touch, Android Chrome, PNG, JPG, or ICO assets.
