export function normalizeFrameTheme(value) {
  return value === 'light' ? 'light' : 'dark'
}

// React state drives presentation, but a save must be able to observe a click
// synchronously. Keeping the device selection here closes the click -> render
// race without coupling it to the independently persisted app theme.
export function createFrameThemeSelection(initialValue = 'dark') {
  let current = normalizeFrameTheme(initialValue)

  return {
    load(value) {
      current = normalizeFrameTheme(value)
      return current
    },
    select(value) {
      current = normalizeFrameTheme(value)
      return current
    },
    snapshot() {
      return current
    },
  }
}

export function withSelectedFrameTheme(settings, selection) {
  return { ...settings, theme: selection.snapshot() }
}
