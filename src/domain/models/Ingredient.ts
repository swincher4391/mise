export interface Range {
  min: number
  max: number
}

export interface Ingredient {
  id: string
  raw: string
  qty: number | Range | null
  unit: string | null
  unitCanonical: string | null
  ingredient: string
  prep: string | null
  notes: string | null
  category: string | null
  optional: boolean
}
