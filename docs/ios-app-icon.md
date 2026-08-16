# iOS app icon

The external app-icon source artwork is:

```text
public/AppLogo.png
```

Apple's asset catalog requires a 1024-by-1024 PNG, while the source artwork is
1254-by-1254. Add a resized copy manually at the following path without
redesigning, cropping, or otherwise altering the logo:

```text
ios/App/Assets.xcassets/AppIcon.appiconset/AppLogo-1024.png
```

`ios/App/Assets.xcassets/AppIcon.appiconset/Contents.json` is configured to use
that file as the single universal iOS app icon. The derived platform renditions
are produced by Xcode; no additional generated PNG sizes should be committed.

This asset is only for the installed app icon. It must not be reused to replace
logos inside the app or its splash experience.
