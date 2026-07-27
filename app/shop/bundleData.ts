export type ShopBundle = {
  id: string
  name: string
  eyebrow: string
  description: string
  deviceCount: 0 | 1
  frameCount: number
  matteCount: number
  regularPrice: number
  price: number
  colors: [string, string, string]
}

export const shopBundles: ShopBundle[] = [
  { id: 'starter-set', name: 'The Starter Set', eyebrow: 'Everything you need', description: 'One RE:MIND, one frame and one matte — a complete setup for your first space.', deviceCount: 1, frameCount: 1, matteCount: 1, regularPrice: 2727, price: 2599, colors: ['#1b1b1a', '#d6c5ae', '#eee9df'] },
  { id: 'complete-home', name: 'The Complete Home', eyebrow: 'Our best value', description: 'One RE:MIND with two frames and two mattes, ready to change with your room or season.', deviceCount: 1, frameCount: 2, matteCount: 2, regularPrice: 3275, price: 2999, colors: ['#6d4935', '#e6e2d9', '#87927e'] },
  { id: 'frame-pair', name: 'The Frame Pair', eyebrow: 'Two fresh looks', description: 'Two interchangeable frames and one matte for an existing RE:MIND display.', deviceCount: 0, frameCount: 2, matteCount: 1, regularPrice: 947, price: 849, colors: ['#202120', '#c69762', '#f1eee7'] },
  { id: 'style-library', name: 'The Style Library', eyebrow: 'Maximum flexibility', description: 'Three frames and three mattes to build a flexible collection around the RE:MIND you own.', deviceCount: 0, frameCount: 3, matteCount: 3, regularPrice: 1644, price: 1399, colors: ['#304238', '#a9744a', '#c6b8a5'] },
]

export function bundleSavings(bundle: ShopBundle) {
  return bundle.regularPrice - bundle.price
}
