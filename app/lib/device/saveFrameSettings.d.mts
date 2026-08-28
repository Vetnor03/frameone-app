export type FrameTheme = 'dark' | 'light'
export type FrameSettings = Record<string, unknown> & { theme: FrameTheme }

export function saveFrameSettings(args: {
  deviceId: string
  settingsJson: FrameSettings
  accessToken: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: true; saved_settings_json: FrameSettings; updated_at: string | null }>
