export type ShopFrame = {
  id: string
  name: string
  price: number | null
  subtitle: string
  palette: [string, string, string]
  swatches: string[]
  imageSrc: string
  configuratorPreviewSrc: string
}

export type ShopMatte = {
  id: string
  name: string
  price: number | null
  configuratorPreviewSrc: string
}

export type DisplayMode = 'dark' | 'light'

export const displayOptions: Array<{ id: DisplayMode; name: string; previewSrc: string }> = [
  { id: 'dark', name: 'Dark', previewSrc: '/shop/products/device/Dark.png' },
  { id: 'light', name: 'Light', previewSrc: '/shop/products/device/Light.png' },
]

export const remindProduct = {
  id: 'remind',
  name: 'RE:MIND',
  price: 2229,
} as const

export const shopFrames: ShopFrame[] = [
  {
    id: 'midnight-black', name: 'Midnight Black', price: 349, subtitle: 'Matte aluminum',
    palette: ['#111214', '#252628', '#3c3d40'], swatches: ['#111214', '#d5d5d5'],
    imageSrc: '/shop/frames/midnight-black.png',
    configuratorPreviewSrc: '/shop/products/frames/Dark.png',
  },
  {
    id: 'metal', name: 'Metal', price: null, subtitle: '',
    palette: ['#b9b9b7', '#d2d2d0', '#999a98'], swatches: [],
    imageSrc: '',
    configuratorPreviewSrc: '/shop/products/frames/Metal.png',
  },
  {
    id: 'natural-oak', name: 'Natural Oak', price: 399, subtitle: 'Real oak',
    palette: ['#b5824f', '#cb9b67', '#deb57e'], swatches: ['#bb8d5f', '#d8be9f'],
    imageSrc: '/shop/frames/natural-oak.png',
    configuratorPreviewSrc: '/shop/products/frames/Oak.png',
  },
  {
    id: 'walnut-wood', name: 'Walnut Wood', price: 399, subtitle: 'Real walnut',
    palette: ['#5a3a2a', '#7a513c', '#946550'], swatches: ['#6a4633', '#8a624a'],
    imageSrc: '/shop/frames/walnut-wood.png',
    configuratorPreviewSrc: '/shop/products/frames/Walnut.png',
  },
  {
    id: 'cloud-white', name: 'Cloud White', price: 349, subtitle: 'Matte aluminum',
    palette: ['#e8e7e3', '#f2f2ee', '#dbdad5'], swatches: ['#f0f0ef', '#cfcfcf'],
    imageSrc: '/shop/frames/cloud-white.png',
    configuratorPreviewSrc: '/shop/products/frames/White.png',
  },
  ...[
    ['custom-friends', 'Custom Friends', 'Custom_Friends.png'],
    ['custom-grinch', 'Custom Grinch', 'Custom_Grinch.png'],
    ['custom-snoopy', 'Custom Snoopy', 'Custom_Snoopy.png'],
  ].map(([id, name, filename]) => ({
    id, name, price: null, subtitle: '', palette: ['#eee', '#ddd', '#ccc'] as [string, string, string], swatches: [], imageSrc: '',
    configuratorPreviewSrc: `/shop/products/frames/${filename}`,
  })),
]

// Matte prices have not been commercially defined, so they remain explicitly null.
export const shopMattes: ShopMatte[] = [
  ['beige', 'Beige', 'Beige.png'],
  ['black', 'Black', 'Black.png'],
  ['black-white', 'Black / White', 'Black_White.png'],
  ['brown', 'Brown', 'Brown.png'],
  ['green', 'Green', 'Green.png'],
  ['white', 'White', 'White.png'],
  ['white-black', 'White / Black', 'White_Black.png'],
  ['custom-friends', 'Custom Friends', 'Custom_Friends.png'],
  ['custom-grinch', 'Custom Grinch', 'Custom_Grinch.png'],
  ['custom-snoopy', 'Custom Snoopy', 'Custom_Snoopy.png'],
].map(([id, name, filename]) => ({
  id,
  name,
  price: null,
  configuratorPreviewSrc: `/shop/products/mattes/${filename}`,
}))

export function formatNok(value: number) {
  return `${value.toLocaleString('nb-NO').replace(/ /g, ' ')} NOK`
}
