export const MAX_FRAME_NAME_LENGTH = 40

export function normalizeFrameName(value) {
  const name = String(value ?? '').trim()
  if (!name) return { ok: false, error: 'empty_frame_name' }
  if (name.length > MAX_FRAME_NAME_LENGTH) return { ok: false, error: 'frame_name_too_long' }
  return { ok: true, name }
}
