# iOS App Icon

The iOS app icon source image is the uploaded PNG at:

```text
ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
```

Do not redraw, redesign, regenerate, or replace it with generated derivatives when updating the app icon.

## Asset catalog configuration

`ios/App/Assets.xcassets/AppIcon.appiconset/Contents.json` is intentionally configured with a single iOS universal app icon entry that points directly to `AppIcon-1024.png`. Xcode/asset catalog tooling should derive the required iOS app icon renditions from that source during the iOS build.

There is no repository script for generating iPhone/iPad icon PNG variants from SVG. If the app icon changes, replace `AppIcon-1024.png` itself and keep `Contents.json` pointed at that same file.
