/** Maps common unit abbreviations/variants to a canonical form. */
export const UNIT_MAP: Record<string, string> = {
  // Teaspoon
  teaspoon: 'teaspoon',
  teaspoons: 'teaspoon',
  tsp: 'teaspoon',
  tsps: 'teaspoon',
  t: 'teaspoon',

  // Tablespoon
  tablespoon: 'tablespoon',
  tablespoons: 'tablespoon',
  tbsp: 'tablespoon',
  tbsps: 'tablespoon',
  tbs: 'tablespoon',
  tbl: 'tablespoon',

  // Cup
  cup: 'cup',
  cups: 'cup',
  c: 'cup',

  // Fluid ounce
  'fluid ounce': 'fluid ounce',
  'fluid ounces': 'fluid ounce',
  'fl oz': 'fluid ounce',
  floz: 'fluid ounce',

  // Pint
  pint: 'pint',
  pints: 'pint',
  pt: 'pint',

  // Quart
  quart: 'quart',
  quarts: 'quart',
  qt: 'quart',
  qts: 'quart',

  // Gallon
  gallon: 'gallon',
  gallons: 'gallon',
  gal: 'gallon',

  // Milliliter
  milliliter: 'milliliter',
  milliliters: 'milliliter',
  ml: 'milliliter',
  mls: 'milliliter',

  // Liter
  liter: 'liter',
  liters: 'liter',
  litre: 'liter',
  litres: 'liter',
  l: 'liter',

  // Ounce (weight)
  ounce: 'ounce',
  ounces: 'ounce',
  oz: 'ounce',

  // Pound
  pound: 'pound',
  pounds: 'pound',
  lb: 'pound',
  lbs: 'pound',

  // Gram
  gram: 'gram',
  grams: 'gram',
  g: 'gram',
  gm: 'gram',

  // Kilogram
  kilogram: 'kilogram',
  kilograms: 'kilogram',
  kg: 'kilogram',
  kgs: 'kilogram',

  // Piece/count
  piece: 'piece',
  pieces: 'piece',
  pc: 'piece',
  pcs: 'piece',

  // Common cooking units
  pinch: 'pinch',
  pinches: 'pinch',
  dash: 'dash',
  dashes: 'dash',
  bunch: 'bunch',
  bunches: 'bunch',
  sprig: 'sprig',
  sprigs: 'sprig',
  clove: 'clove',
  cloves: 'clove',
  slice: 'slice',
  slices: 'slice',
  head: 'head',
  heads: 'head',
  stalk: 'stalk',
  stalks: 'stalk',
  stick: 'stick',
  sticks: 'stick',
  can: 'can',
  cans: 'can',
  jar: 'jar',
  jars: 'jar',
  package: 'package',
  packages: 'package',
  pkg: 'package',
  bag: 'bag',
  bags: 'bag',
  box: 'box',
  boxes: 'box',
  bottle: 'bottle',
  bottles: 'bottle',
  handful: 'handful',
  handfuls: 'handful',
  drop: 'drop',
  drops: 'drop',
  whole: 'whole',
  large: 'large',
  medium: 'medium',
  small: 'small',
}

/** Set of all canonical unit names for quick lookup. */
export const CANONICAL_UNITS = new Set(Object.values(UNIT_MAP))

/** Volume conversions to teaspoons (base unit). */
export const VOLUME_TO_TSP: Record<string, number> = {
  teaspoon: 1,
  tablespoon: 3,
  'fluid ounce': 6,
  cup: 48,
  pint: 96,
  quart: 192,
  gallon: 768,
  milliliter: 0.202884,
  liter: 202.884,
}

/** Weight conversions to grams (base unit). */
export const WEIGHT_TO_G: Record<string, number> = {
  gram: 1,
  kilogram: 1000,
  ounce: 28.3495,
  pound: 453.592,
}

/** Check if a canonical unit is a volume unit. */
export function isVolumeUnit(unit: string): boolean {
  return unit in VOLUME_TO_TSP
}

/** Check if a canonical unit is a weight unit. */
export function isWeightUnit(unit: string): boolean {
  return unit in WEIGHT_TO_G
}
