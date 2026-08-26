export const THEME_STORAGE_KEY = 'remind-app-theme'

export type AppTheme = 'dark' | 'light'

export const APP_THEME_COLORS: Record<AppTheme, string> = {
  dark: '#061b24',
  light: '#f5f6f8',
}

export function isAppTheme(value: unknown): value is AppTheme {
  return value === 'dark' || value === 'light'
}

export function storedTheme(): AppTheme | null {
  if (typeof window === 'undefined') return null

  const value = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isAppTheme(value) ? value : null
}

export function initialTheme(): AppTheme {
  if (typeof document !== 'undefined' && isAppTheme(document.documentElement.dataset.theme)) {
    return document.documentElement.dataset.theme
  }
  return storedTheme() ?? 'light'
}

export function persistTheme(theme: AppTheme) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
}

export function applyDocumentTheme(theme: AppTheme) {
  if (typeof document === 'undefined') return

  const color = APP_THEME_COLORS[theme]
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.documentElement.style.backgroundColor = color
  document.body.style.backgroundColor = color

  const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (meta) meta.content = color
}
