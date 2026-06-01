# iOS App Icon

The iOS app icon asset catalog source image remains:

```text
ios/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
```

`ios/App/Assets.xcassets/AppIcon.appiconset/Contents.json` is intentionally configured with a single iOS universal app icon entry that points directly to `AppIcon-1024.png`. Xcode/asset catalog tooling derives the required iOS app icon renditions from that catalog source during the iOS build.

For this icon refresh, do not regenerate, replace, or commit PNG/icon files. The manually uploaded v2 web source is:

```text
public/AppIcon-1024v2.png
```

Keep the iOS asset catalog wiring conservative unless a catalog-local `AppIcon-1024v2.png` is added manually in a separate asset-only change.
