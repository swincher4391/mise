export interface Step {
  id: string
  order: number
  text: string
  timerSeconds: number | null
  ingredientRefs: string[]
}
