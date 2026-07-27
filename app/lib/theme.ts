export const THEME_STORAGE_KEY = 'remind-theme'

export type AppTheme = 'dark' | 'light'

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
  return storedTheme() ?? 'dark'
}

export function persistTheme(theme: AppTheme) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
}
