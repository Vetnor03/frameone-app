// Exact portrait PWA viewport sizes used by iOS for native Home Screen launch images.
// Apple needs one physical-pixel PNG per matching media query.
export const iosPortraitLaunchSizes = [
  [375, 667, 2],  // iPhone 8 / SE
  [414, 736, 3],  // iPhone 8 Plus
  [375, 812, 3],  // iPhone X / XS / 11 Pro
  [414, 896, 2],  // iPhone XR / 11
  [414, 896, 3],  // iPhone XS Max / 11 Pro Max
  [360, 780, 3],  // iPhone 12 / 13 mini
  [390, 844, 3],  // iPhone 12 / 13 / 14
  [428, 926, 3],  // iPhone 12 / 13 Pro Max / 14 Plus
  [393, 852, 3],  // iPhone 14 Pro / 15 / 15 Pro / 16
  [430, 932, 3],  // iPhone 14 Pro Max / 15 Plus / 15 Pro Max
  [402, 874, 3],  // iPhone 16 Pro
  [440, 956, 3],  // iPhone 16 Pro Max
  [420, 912, 3],  // newer Pro-sized iPhones
]
export const iosLaunchStartupImages = iosPortraitLaunchSizes.map(([width, height, scale]) => ({
  url: `/ios-startup/${width * scale}x${height * scale}-v2.png`,
  media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: portrait)`,
}))
