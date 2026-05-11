import { createRemindIconImageResponse } from './lib/remindIconImage'

export const size = {
  width: 1024,
  height: 1024,
}

export const contentType = 'image/png'

export default function Icon() {
  return createRemindIconImageResponse(size.width)
}
