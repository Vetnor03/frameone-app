# iOS App Icon Generation

The PR intentionally does **not** commit generated PNG/JPG/WebP/ICO files. The Re-mind app icon source is the text SVG at:

- `ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon.svg`

That SVG is the source of truth for local generation. Do not redraw, re-type, move, or reinterpret the logo when updating it.

## Generate the PNG app icon files locally

From the repository root, run:

```sh
npm run generate:ios-icons
```

The script reads `ios/App/Assets.xcassets/AppIcon.appiconset/Contents.json` and writes every required PNG into:

```text
ios/App/Assets.xcassets/AppIcon.appiconset/
```

The generated PNGs are intentionally ignored by git.

## Required manual 1024×1024 PNG location

If Xcode/App Store tooling requires you to manually place the final 1024×1024 PNG, put it at exactly:

```text
ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
```

That filename is already declared as the `ios-marketing` icon in `Contents.json`. After placing it manually, run `npm run generate:ios-icons` if you also need the smaller iPhone/iPad PNG sizes regenerated from the committed SVG source.
