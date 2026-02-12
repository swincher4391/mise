import { useState } from 'react'

interface ManualItemInputProps {
  onAdd: (name: string) => void
}

export function ManualItemInput({ onAdd }: ManualItemInputProps) {
  const [value, setValue] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setValue('')
  }

  return (
    <form className="manual-item-input" onSubmit={handleSubmit}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add custom item..."
        className="manual-item-field"
      />
      <button type="submit" className="nav-btn" disabled={!value.trim()}>
        Add
      </button>
    </form>
  )
}
