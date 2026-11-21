// Sequence settings writes, including recovery after an unsuccessful earlier write.
// Every call receives a separate snapshot; a later choice must reach the server last.
export function enqueueSerializedSettingsSave(tailRef, save) {
  const next = tailRef.current.catch(() => {}).then(save)
  tailRef.current = next
  return next
}
