export type ShopFrame = {
  id: string
  name: string
  price: number
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

export const remindProduct = {
  id: 'remind',
  name: 'RE:MIND',
  price: 2229,
  devicePreviewSrc: '/shop/configurator/device.png',
  fallbackPreviewSrc: '/shop/remind-device-v2.png',
} as const

export const shopFrames: ShopFrame[] = [
  {
    id: 'midnight-black', name: 'Midnight Black', price: 349, subtitle: 'Matte aluminum',
    palette: ['#111214', '#252628', '#3c3d40'], swatches: ['#111214', '#d5d5d5'],
    imageSrc: '/shop/frames/midnight-black.png',
    configuratorPreviewSrc: '/shop/configurator/frames/midnight-black.png',
  },
  {
    id: 'walnut-wood', name: 'Walnut Wood', price: 399, subtitle: 'Real walnut',
    palette: ['#5a3a2a', '#7a513c', '#946550'], swatches: ['#6a4633', '#8a624a'],
    imageSrc: '/shop/frames/walnut-wood.png',
    configuratorPreviewSrc: '/shop/configurator/frames/walnut-wood.png',
  },
  {
    id: 'natural-oak', name: 'Natural Oak', price: 399, subtitle: 'Real oak',
    palette: ['#b5824f', '#cb9b67', '#deb57e'], swatches: ['#bb8d5f', '#d8be9f'],
    imageSrc: '/shop/frames/natural-oak.png',
    configuratorPreviewSrc: '/shop/configurator/frames/natural-oak.png',
  },
  {
    id: 'cloud-white', name: 'Cloud White', price: 349, subtitle: 'Matte aluminum',
    palette: ['#e8e7e3', '#f2f2ee', '#dbdad5'], swatches: ['#f0f0ef', '#cfcfcf'],
    imageSrc: '/shop/frames/cloud-white.png',
    configuratorPreviewSrc: '/shop/configurator/frames/cloud-white.png',
  },
]

// No matte variants or commercial pricing exist in the shop yet. This explicit
// placeholder keeps the configurator functional without inventing product data.
export const shopMattes: ShopMatte[] = [
  {
    id: 'matte',
    name: 'Matte',
    price: null,
    configuratorPreviewSrc: '/shop/configurator/mattes/matte.png',
  },
]

export function formatNok(value: number) {
  return `${value.toLocaleString('nb-NO').replace(/ /g, ' ')} NOK`
}
