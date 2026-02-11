const STORAGE_KEY = 'mise_saves_since_export'

export function incrementSaveCount(): void {
  const current = parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10)
  localStorage.setItem(STORAGE_KEY, String(current + 1))
}

export function resetSaveCount(): void {
  localStorage.setItem(STORAGE_KEY, '0')
}

export function shouldNudgeBackup(): boolean {
  const count = parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10)
  return count >= 10
}
