export const MAX_FRAME_NAME_LENGTH: number
export function normalizeFrameName(value: unknown):
  | { ok: true; name: string }
  | { ok: false; error: 'empty_frame_name' | 'frame_name_too_long' }
