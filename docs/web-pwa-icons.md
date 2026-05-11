# Web/PWA icon replacement checklist

The web app intentionally keeps icon references in code and does **not** commit PNG, JPG, or ICO binary icon assets in this PR. To update the deployed Vercel/PWA icon artwork, manually upload the generated binary assets in GitHub after this PR is merged.

## Source artwork

Generate every web/PWA icon below from the uploaded Re-mind source artwork:

```text
ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
```

Do not modify the native iOS app icon asset catalog when updating the web/PWA icons.

## Currently used web/PWA icon paths

These are the icon URL paths referenced by the web app metadata and manifest:

| Purpose | URL path used by the app | Repository file to manually upload/replace |
| --- | --- | --- |
| Browser favicon | `/favicon.ico?v=remind-app-icon-20260511` | `public/favicon.ico` |
| 16px favicon | `/favicon-16x16.png?v=remind-app-icon-20260511` | `public/favicon-16x16.png` |
| 32px favicon | `/favicon-32x32.png?v=remind-app-icon-20260511` | `public/favicon-32x32.png` |
| Apple touch icon | `/apple-touch-icon.png?v=remind-app-icon-20260511` | `public/apple-touch-icon.png` |
| Web app icon | `/icon-192x192.png?v=remind-app-icon-20260511` | `public/icon-192x192.png` |
| Web app icon | `/icon-512x512.png?v=remind-app-icon-20260511` | `public/icon-512x512.png` |
| PWA manifest icon, `any` + `maskable` | `/android-chrome-192x192.png?v=remind-app-icon-20260511` | `public/android-chrome-192x192.png` |
| PWA manifest icon, `any` + `maskable` | `/android-chrome-512x512.png?v=remind-app-icon-20260511` | `public/android-chrome-512x512.png` |

## Optional Next metadata file conventions

If you want to keep Next.js file-convention icons available too, manually upload these generated assets after the PR as separate binary files:

| Purpose | Repository file to manually upload/replace |
| --- | --- |
| Next app icon convention | `app/icon.png` |
| Next Apple icon convention | `app/apple-icon.png` |

The app metadata already points at the `public/` paths listed above, so the `public/` files are the required Vercel/PWA replacements.

## Public SVG icon assets

`public/favicon.svg` and `public/remind-icon.svg` are not referenced by the current app metadata or PWA manifest. Leave them unchanged unless you intentionally create non-binary SVG versions of the same Re-mind artwork.
