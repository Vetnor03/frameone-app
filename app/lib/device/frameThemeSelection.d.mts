export type FrameTheme = 'dark' | 'light'

export type FrameThemeSelection = {
  load(value: unknown): FrameTheme
  select(value: unknown): FrameTheme
  snapshot(): FrameTheme
}

export function normalizeFrameTheme(value: unknown): FrameTheme
export function createFrameThemeSelection(initialValue?: unknown): FrameThemeSelection
export function withSelectedFrameTheme<T extends Record<string, unknown>>(
  settings: T,
  selection: FrameThemeSelection,
): T & { theme: FrameTheme }
