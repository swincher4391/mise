/**
 * Mise Nutrition Estimation — Chrome Extension Module
 *
 * Self-contained plain JavaScript (no imports/exports).
 * Exposes window.MiseNutrition with:
 *   - parseIngredientLine(rawLine)
 *   - estimateRecipeNutrition(rawIngredients, servings)
 *   - scaleQuantity(qty, originalServings, newServings)
 *
 * Ported from:
 *   src/application/nutrition/estimateNutrition.ts
 *   src/domain/constants/units.ts
 *   src/data/usda-staples.json (top ~80 staples)
 */
(function () {
  'use strict';

  // =========================================================================
  // Unit mapping — canonical forms
  // =========================================================================

  var UNIT_MAP = {
    // Teaspoon
    teaspoon: 'teaspoon', teaspoons: 'teaspoon', tsp: 'teaspoon', tsps: 'teaspoon', t: 'teaspoon',
    // Tablespoon
    tablespoon: 'tablespoon', tablespoons: 'tablespoon', tbsp: 'tablespoon', tbsps: 'tablespoon', tbs: 'tablespoon', tbl: 'tablespoon',
    // Cup
    cup: 'cup', cups: 'cup', c: 'cup',
    // Fluid ounce
    'fluid ounce': 'fluid ounce', 'fluid ounces': 'fluid ounce', 'fl oz': 'fluid ounce', floz: 'fluid ounce',
    // Pint
    pint: 'pint', pints: 'pint', pt: 'pint',
    // Quart
    quart: 'quart', quarts: 'quart', qt: 'quart', qts: 'quart',
    // Gallon
    gallon: 'gallon', gallons: 'gallon', gal: 'gallon',
    // Milliliter
    milliliter: 'milliliter', milliliters: 'milliliter', ml: 'milliliter', mls: 'milliliter',
    // Liter
    liter: 'liter', liters: 'liter', litre: 'liter', litres: 'liter', l: 'liter',
    // Ounce (weight)
    ounce: 'ounce', ounces: 'ounce', oz: 'ounce',
    // Pound
    pound: 'pound', pounds: 'pound', lb: 'pound', lbs: 'pound',
    // Gram
    gram: 'gram', grams: 'gram', g: 'gram', gm: 'gram',
    // Kilogram
    kilogram: 'kilogram', kilograms: 'kilogram', kg: 'kilogram', kgs: 'kilogram',
    // Piece / count
    piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece',
    // Cooking units
    pinch: 'pinch', pinches: 'pinch',
    dash: 'dash', dashes: 'dash',
    bunch: 'bunch', bunches: 'bunch',
    sprig: 'sprig', sprigs: 'sprig',
    clove: 'clove', cloves: 'clove',
    slice: 'slice', slices: 'slice',
    head: 'head', heads: 'head',
    stalk: 'stalk', stalks: 'stalk',
    stick: 'stick', sticks: 'stick',
    can: 'can', cans: 'can',
    jar: 'jar', jars: 'jar',
    package: 'package', packages: 'package', pkg: 'package',
    bag: 'bag', bags: 'bag',
    box: 'box', boxes: 'box',
    bottle: 'bottle', bottles: 'bottle',
    handful: 'handful', handfuls: 'handful',
    drop: 'drop', drops: 'drop',
    whole: 'whole',
    large: 'large',
    medium: 'medium',
    small: 'small'
  };

  // =========================================================================
  // Volume conversions to teaspoons (base unit)
  // =========================================================================

  var VOLUME_TO_TSP = {
    teaspoon: 1,
    tablespoon: 3,
    'fluid ounce': 6,
    cup: 48,
    pint: 96,
    quart: 192,
    gallon: 768,
    milliliter: 0.202884,
    liter: 202.884
  };

  // =========================================================================
  // Weight conversions to grams (base unit)
  // =========================================================================

  var WEIGHT_TO_G = {
    gram: 1,
    kilogram: 1000,
    ounce: 28.3495,
    pound: 453.592
  };

  function isVolumeUnit(unit) {
    return VOLUME_TO_TSP.hasOwnProperty(unit);
  }

  function isWeightUnit(unit) {
    return WEIGHT_TO_G.hasOwnProperty(unit);
  }

  // =========================================================================
  // Piece weight (grams per count) for common ingredients
  // =========================================================================

  var PIECE_WEIGHT_G = {
    egg: 50, eggs: 50,
    banana: 118, apple: 182,
    lemon: 58, lime: 67, orange: 131,
    onion: 150, 'yellow onion': 150, 'red onion': 150,
    shallot: 30,
    potato: 150, potatoes: 150, 'sweet potato': 130,
    tomato: 123, tomatoes: 123,
    carrot: 61, carrots: 61,
    celery: 40,
    avocado: 150,
    'bell pepper': 150, 'red bell pepper': 150, 'green bell pepper': 150,
    jalapeno: 14,
    cucumber: 300, zucchini: 200, eggplant: 458,
    'chicken breast': 174, 'chicken thigh': 116, 'chicken drumstick': 105,
    'pork chop': 170,
    garlic: 3,
    'green onion': 15, 'green onions': 15,
    scallion: 15, scallions: 15
  };

  // =========================================================================
  // Density table — grams per teaspoon (for volume-to-weight conversion)
  // =========================================================================

  var DENSITY_G_PER_TSP = {
    // Liquids
    water: 5.0, milk: 5.1, 'whole milk': 5.1, 'skim milk': 5.1,
    buttermilk: 5.1, 'heavy cream': 5.0, 'half and half': 5.0,
    'sour cream': 5.1, yogurt: 5.1, 'greek yogurt': 5.5,
    broth: 5.0, stock: 5.0, 'chicken broth': 5.0, 'chicken stock': 5.0,
    'beef broth': 5.0, 'beef stock': 5.0, 'vegetable broth': 5.0, 'vegetable stock': 5.0,
    wine: 5.0, 'white wine': 5.0, 'red wine': 5.0, beer: 5.0,
    'coconut milk': 5.0, 'canned coconut milk': 5.0,
    vinegar: 5.0, 'apple cider vinegar': 5.0, 'balsamic vinegar': 5.3,
    'rice vinegar': 5.0, 'soy sauce': 5.3, 'fish sauce': 5.3,
    'lemon juice': 5.1, 'lime juice': 5.1, 'orange juice': 5.2,
    honey: 7.1, 'maple syrup': 6.6, molasses: 6.9,
    ketchup: 5.1, 'tomato sauce': 5.1, 'tomato paste': 5.3, salsa: 5.1,

    // Oils
    'olive oil': 4.5, 'extra virgin olive oil': 4.5,
    'vegetable oil': 4.5, 'canola oil': 4.5, 'coconut oil': 4.5, 'sesame oil': 4.5,

    // Flours & powders
    flour: 2.6, 'all-purpose flour': 2.6, 'whole wheat flour': 2.5,
    cornstarch: 2.7, cornmeal: 2.5,
    sugar: 4.2, 'white sugar': 4.2, 'brown sugar': 4.6, 'powdered sugar': 2.5,
    'cocoa powder': 1.8,
    'baking powder': 4.6, 'baking soda': 4.6,
    'garlic powder': 2.8, 'onion powder': 2.4,
    cinnamon: 2.6, cumin: 2.1, paprika: 2.3, 'chili powder': 2.6,
    oregano: 1.0, 'dried basil': 0.7, 'dried thyme': 0.9,
    turmeric: 3.0, 'cayenne pepper': 1.8, 'red pepper flakes': 1.5,
    'italian seasoning': 0.9,

    // Butter / spreads
    butter: 4.7, 'unsalted butter': 4.7, 'cream cheese': 4.8,
    mayonnaise: 4.7, 'peanut butter': 5.3,
    mustard: 5.0, 'dijon mustard': 5.0,

    // Grains
    rice: 3.9, 'white rice': 3.9, 'brown rice': 3.9, 'jasmine rice': 3.9,
    oats: 1.6, oatmeal: 1.6, quinoa: 3.5, couscous: 3.3,
    breadcrumbs: 2.3, panko: 1.2,

    // Seeds
    'sesame seeds': 3.0, 'sesame seed': 3.0,

    // Default fallback
    _default: 4.0
  };

  // =========================================================================
  // Count-based units (no unit or piece-like)
  // =========================================================================

  var COUNT_UNITS_LIST = [null, 'piece', 'whole', 'large', 'medium', 'small', 'clove', 'head', 'stalk', 'stick', 'bunch', 'sprig'];
  var COUNT_UNITS = {};
  for (var i = 0; i < COUNT_UNITS_LIST.length; i++) {
    COUNT_UNITS[String(COUNT_UNITS_LIST[i])] = true;
  }

  function isCountUnit(unit) {
    return COUNT_UNITS.hasOwnProperty(String(unit));
  }

  // =========================================================================
  // Suffix noise — trailing words to strip when looking up staples
  // =========================================================================

  var SUFFIX_NOISE = [
    ' cloves', ' clove', ' stalks', ' stalk', ' leaves', ' leaf',
    ' pieces', ' piece', ' heads', ' head', ' sprigs', ' sprig'
  ];

  // =========================================================================
  // Generic ingredient aliases
  // =========================================================================

  var GENERIC_ALIASES = {
    oil: 'vegetable oil',
    'cooking oil': 'vegetable oil',
    'neutral oil': 'vegetable oil',
    pepper: 'black pepper',
    onions: 'onion',
    tomatoes: 'tomato',
    potatoes: 'potato',
    'spring onion': 'green onion',
    'spring onions': 'green onion',
    scallion: 'green onion',
    scallions: 'green onion'
  };

  // =========================================================================
  // USDA Staples — top ~80 most common ingredients (per100g macros, no fdcId)
  // =========================================================================

  var STAPLES = {
    // --- Proteins ---
    'chicken breast':    { calories: 165, protein: 31.0, fat: 3.6,  carbs: 0,    fiber: 0 },
    'chicken thigh':     { calories: 209, protein: 26.0, fat: 10.9, carbs: 0,    fiber: 0 },
    'ground chicken':    { calories: 143, protein: 17.4, fat: 8.1,  carbs: 0,    fiber: 0 },
    'ground turkey':     { calories: 203, protein: 27.4, fat: 10.0, carbs: 0,    fiber: 0 },
    'ground beef':       { calories: 254, protein: 17.2, fat: 20.0, carbs: 0,    fiber: 0 },
    'lean ground beef':  { calories: 176, protein: 20.0, fat: 10.0, carbs: 0,    fiber: 0 },
    'beef steak':        { calories: 271, protein: 26.1, fat: 17.4, carbs: 0,    fiber: 0 },
    'pork chop':         { calories: 231, protein: 25.7, fat: 13.5, carbs: 0,    fiber: 0 },
    'pork tenderloin':   { calories: 143, protein: 26.2, fat: 3.5,  carbs: 0,    fiber: 0 },
    'ground pork':       { calories: 263, protein: 16.9, fat: 21.2, carbs: 0,    fiber: 0 },
    bacon:               { calories: 541, protein: 37.0, fat: 41.8, carbs: 1.4,  fiber: 0 },
    sausage:             { calories: 301, protein: 18.0, fat: 24.0, carbs: 2.0,  fiber: 0 },
    salmon:              { calories: 208, protein: 20.4, fat: 13.4, carbs: 0,    fiber: 0 },
    'salmon fillet':     { calories: 208, protein: 20.4, fat: 13.4, carbs: 0,    fiber: 0 },
    tuna:                { calories: 132, protein: 28.2, fat: 1.3,  carbs: 0,    fiber: 0 },
    'canned tuna':       { calories: 116, protein: 25.5, fat: 0.8,  carbs: 0,    fiber: 0 },
    shrimp:              { calories: 99,  protein: 24.0, fat: 0.3,  carbs: 0.2,  fiber: 0 },
    cod:                 { calories: 82,  protein: 17.8, fat: 0.7,  carbs: 0,    fiber: 0 },
    tilapia:             { calories: 96,  protein: 20.1, fat: 1.7,  carbs: 0,    fiber: 0 },
    egg:                 { calories: 155, protein: 12.6, fat: 10.6, carbs: 1.1,  fiber: 0 },
    eggs:                { calories: 155, protein: 12.6, fat: 10.6, carbs: 1.1,  fiber: 0 },
    tofu:                { calories: 76,  protein: 8.1,  fat: 4.8,  carbs: 1.9,  fiber: 0.3 },
    'firm tofu':         { calories: 76,  protein: 8.1,  fat: 4.8,  carbs: 1.9,  fiber: 0.3 },

    // --- Dairy ---
    milk:                { calories: 61,  protein: 3.2,  fat: 3.3,  carbs: 4.8,  fiber: 0 },
    'whole milk':        { calories: 61,  protein: 3.2,  fat: 3.3,  carbs: 4.8,  fiber: 0 },
    'heavy cream':       { calories: 340, protein: 2.1,  fat: 36.1, carbs: 2.8,  fiber: 0 },
    'sour cream':        { calories: 198, protein: 2.4,  fat: 19.4, carbs: 4.6,  fiber: 0 },
    'cream cheese':      { calories: 342, protein: 5.9,  fat: 34.2, carbs: 4.1,  fiber: 0 },
    yogurt:              { calories: 61,  protein: 3.5,  fat: 3.3,  carbs: 4.7,  fiber: 0 },
    'greek yogurt':      { calories: 97,  protein: 9.0,  fat: 5.0,  carbs: 3.6,  fiber: 0 },
    butter:              { calories: 717, protein: 0.9,  fat: 81.1, carbs: 0.1,  fiber: 0 },
    'unsalted butter':   { calories: 717, protein: 0.9,  fat: 81.1, carbs: 0.1,  fiber: 0 },
    'cheddar cheese':    { calories: 403, protein: 24.9, fat: 33.1, carbs: 1.3,  fiber: 0 },
    'mozzarella cheese': { calories: 280, protein: 27.5, fat: 17.1, carbs: 3.1,  fiber: 0 },
    mozzarella:          { calories: 280, protein: 27.5, fat: 17.1, carbs: 3.1,  fiber: 0 },
    'parmesan cheese':   { calories: 431, protein: 38.5, fat: 28.6, carbs: 4.1,  fiber: 0 },
    parmesan:            { calories: 431, protein: 38.5, fat: 28.6, carbs: 4.1,  fiber: 0 },

    // --- Grains & Starches ---
    rice:                { calories: 130, protein: 2.7,  fat: 0.3,  carbs: 28.2, fiber: 0.4 },
    'white rice':        { calories: 130, protein: 2.7,  fat: 0.3,  carbs: 28.2, fiber: 0.4 },
    'brown rice':        { calories: 123, protein: 2.7,  fat: 1.0,  carbs: 25.6, fiber: 1.8 },
    pasta:               { calories: 131, protein: 5.0,  fat: 1.1,  carbs: 25.0, fiber: 1.8 },
    spaghetti:           { calories: 131, protein: 5.0,  fat: 1.1,  carbs: 25.0, fiber: 1.8 },
    noodles:             { calories: 138, protein: 4.5,  fat: 2.1,  carbs: 25.2, fiber: 1.2 },
    quinoa:              { calories: 120, protein: 4.4,  fat: 1.9,  carbs: 21.3, fiber: 2.8 },
    bread:               { calories: 265, protein: 9.4,  fat: 3.3,  carbs: 49.0, fiber: 2.7 },
    tortilla:            { calories: 306, protein: 8.0,  fat: 7.8,  carbs: 50.5, fiber: 3.3 },
    'flour tortilla':    { calories: 306, protein: 8.0,  fat: 7.8,  carbs: 50.5, fiber: 3.3 },
    'corn tortilla':     { calories: 218, protein: 5.7,  fat: 2.9,  carbs: 44.6, fiber: 5.2 },
    oats:                { calories: 68,  protein: 2.4,  fat: 1.4,  carbs: 12.0, fiber: 1.7 },
    oatmeal:             { calories: 68,  protein: 2.4,  fat: 1.4,  carbs: 12.0, fiber: 1.7 },
    breadcrumbs:         { calories: 395, protein: 13.4, fat: 5.3,  carbs: 71.9, fiber: 4.5 },

    // --- Flours & Baking ---
    flour:               { calories: 364, protein: 10.3, fat: 1.0,  carbs: 76.3, fiber: 2.7 },
    'all-purpose flour': { calories: 364, protein: 10.3, fat: 1.0,  carbs: 76.3, fiber: 2.7 },
    'whole wheat flour': { calories: 340, protein: 13.2, fat: 2.5,  carbs: 71.9, fiber: 10.7 },
    cornstarch:          { calories: 381, protein: 0.3,  fat: 0.1,  carbs: 91.3, fiber: 0.9 },
    'baking powder':     { calories: 53,  protein: 0,    fat: 0,    carbs: 27.7, fiber: 0 },
    'baking soda':       { calories: 0,   protein: 0,    fat: 0,    carbs: 0,    fiber: 0 },
    sugar:               { calories: 387, protein: 0,    fat: 0,    carbs: 100.0, fiber: 0 },
    'white sugar':       { calories: 387, protein: 0,    fat: 0,    carbs: 100.0, fiber: 0 },
    'brown sugar':       { calories: 380, protein: 0.1,  fat: 0,    carbs: 98.1, fiber: 0 },
    'powdered sugar':    { calories: 389, protein: 0,    fat: 0.5,  carbs: 99.8, fiber: 0 },
    honey:               { calories: 304, protein: 0.3,  fat: 0,    carbs: 82.4, fiber: 0.2 },
    'maple syrup':       { calories: 260, protein: 0,    fat: 0.1,  carbs: 67.0, fiber: 0 },

    // --- Oils ---
    'olive oil':         { calories: 884, protein: 0,    fat: 100.0, carbs: 0,   fiber: 0 },
    'extra virgin olive oil': { calories: 884, protein: 0, fat: 100.0, carbs: 0, fiber: 0 },
    'vegetable oil':     { calories: 884, protein: 0,    fat: 100.0, carbs: 0,   fiber: 0 },
    'canola oil':        { calories: 884, protein: 0,    fat: 100.0, carbs: 0,   fiber: 0 },
    'coconut oil':       { calories: 862, protein: 0,    fat: 100.0, carbs: 0,   fiber: 0 },
    'sesame oil':        { calories: 884, protein: 0,    fat: 100.0, carbs: 0,   fiber: 0 },

    // --- Vegetables ---
    onion:               { calories: 40,  protein: 1.1,  fat: 0.1,  carbs: 9.3,  fiber: 1.7 },
    'yellow onion':      { calories: 40,  protein: 1.1,  fat: 0.1,  carbs: 9.3,  fiber: 1.7 },
    'red onion':         { calories: 40,  protein: 1.1,  fat: 0.1,  carbs: 9.3,  fiber: 1.7 },
    'green onion':       { calories: 32,  protein: 1.8,  fat: 0.2,  carbs: 7.3,  fiber: 2.6 },
    shallot:             { calories: 72,  protein: 2.5,  fat: 0.1,  carbs: 16.8, fiber: 3.2 },
    garlic:              { calories: 149, protein: 6.4,  fat: 0.5,  carbs: 33.1, fiber: 2.1 },
    ginger:              { calories: 80,  protein: 1.8,  fat: 0.8,  carbs: 17.8, fiber: 2.0 },
    celery:              { calories: 14,  protein: 0.7,  fat: 0.2,  carbs: 3.0,  fiber: 1.6 },
    carrot:              { calories: 41,  protein: 0.9,  fat: 0.2,  carbs: 9.6,  fiber: 2.8 },
    carrots:             { calories: 41,  protein: 0.9,  fat: 0.2,  carbs: 9.6,  fiber: 2.8 },
    potato:              { calories: 77,  protein: 2.1,  fat: 0.1,  carbs: 17.5, fiber: 2.1 },
    potatoes:            { calories: 77,  protein: 2.1,  fat: 0.1,  carbs: 17.5, fiber: 2.1 },
    'sweet potato':      { calories: 86,  protein: 1.6,  fat: 0.1,  carbs: 20.1, fiber: 3.0 },
    'bell pepper':       { calories: 31,  protein: 1.0,  fat: 0.3,  carbs: 6.0,  fiber: 2.1 },
    'red bell pepper':   { calories: 31,  protein: 1.0,  fat: 0.3,  carbs: 6.0,  fiber: 2.1 },
    'green bell pepper': { calories: 20,  protein: 0.9,  fat: 0.2,  carbs: 4.6,  fiber: 1.7 },
    jalapeno:            { calories: 29,  protein: 0.9,  fat: 0.4,  carbs: 6.5,  fiber: 2.8 },
    tomato:              { calories: 18,  protein: 0.9,  fat: 0.2,  carbs: 3.9,  fiber: 1.2 },
    tomatoes:            { calories: 18,  protein: 0.9,  fat: 0.2,  carbs: 3.9,  fiber: 1.2 },
    'cherry tomatoes':   { calories: 18,  protein: 0.9,  fat: 0.2,  carbs: 3.9,  fiber: 1.2 },
    'canned tomatoes':   { calories: 17,  protein: 0.8,  fat: 0.1,  carbs: 3.5,  fiber: 1.0 },
    'diced tomatoes':    { calories: 17,  protein: 0.8,  fat: 0.1,  carbs: 3.5,  fiber: 1.0 },
    'tomato paste':      { calories: 82,  protein: 4.3,  fat: 0.5,  carbs: 18.9, fiber: 4.1 },
    'tomato sauce':      { calories: 29,  protein: 1.3,  fat: 0.2,  carbs: 5.4,  fiber: 1.5 },
    cucumber:            { calories: 15,  protein: 0.7,  fat: 0.1,  carbs: 3.6,  fiber: 0.5 },
    zucchini:            { calories: 17,  protein: 1.2,  fat: 0.3,  carbs: 3.1,  fiber: 1.0 },
    broccoli:            { calories: 34,  protein: 2.8,  fat: 0.4,  carbs: 6.6,  fiber: 2.6 },
    cauliflower:         { calories: 25,  protein: 1.9,  fat: 0.3,  carbs: 5.0,  fiber: 2.0 },
    spinach:             { calories: 23,  protein: 2.9,  fat: 0.4,  carbs: 3.6,  fiber: 2.2 },
    kale:                { calories: 49,  protein: 4.3,  fat: 0.9,  carbs: 8.8,  fiber: 3.6 },
    lettuce:             { calories: 15,  protein: 1.4,  fat: 0.2,  carbs: 2.9,  fiber: 1.3 },
    cabbage:             { calories: 25,  protein: 1.3,  fat: 0.1,  carbs: 5.8,  fiber: 2.5 },
    'green beans':       { calories: 31,  protein: 1.8,  fat: 0.1,  carbs: 7.0,  fiber: 3.4 },
    corn:                { calories: 86,  protein: 3.3,  fat: 1.4,  carbs: 19.0, fiber: 2.7 },
    peas:                { calories: 81,  protein: 5.4,  fat: 0.4,  carbs: 14.5, fiber: 5.7 },
    mushroom:            { calories: 22,  protein: 3.1,  fat: 0.3,  carbs: 3.3,  fiber: 1.0 },
    mushrooms:           { calories: 22,  protein: 3.1,  fat: 0.3,  carbs: 3.3,  fiber: 1.0 },
    avocado:             { calories: 160, protein: 2.0,  fat: 14.7, carbs: 8.5,  fiber: 6.7 },
    asparagus:           { calories: 20,  protein: 2.2,  fat: 0.1,  carbs: 3.9,  fiber: 2.1 },
    eggplant:            { calories: 25,  protein: 1.0,  fat: 0.2,  carbs: 5.9,  fiber: 3.0 },

    // --- Fruits ---
    banana:              { calories: 89,  protein: 1.1,  fat: 0.3,  carbs: 22.8, fiber: 2.6 },
    apple:               { calories: 52,  protein: 0.3,  fat: 0.2,  carbs: 13.8, fiber: 2.4 },
    lemon:               { calories: 29,  protein: 1.1,  fat: 0.3,  carbs: 9.3,  fiber: 2.8 },
    'lemon juice':       { calories: 22,  protein: 0.4,  fat: 0.2,  carbs: 6.9,  fiber: 0.3 },
    lime:                { calories: 30,  protein: 0.7,  fat: 0.2,  carbs: 10.5, fiber: 2.8 },
    'lime juice':        { calories: 25,  protein: 0.4,  fat: 0.1,  carbs: 8.4,  fiber: 0.4 },
    orange:              { calories: 47,  protein: 0.9,  fat: 0.1,  carbs: 11.8, fiber: 2.4 },

    // --- Legumes ---
    'black beans':       { calories: 132, protein: 8.9,  fat: 0.5,  carbs: 23.7, fiber: 8.7 },
    'kidney beans':      { calories: 127, protein: 8.7,  fat: 0.5,  carbs: 22.8, fiber: 7.4 },
    chickpeas:           { calories: 164, protein: 8.9,  fat: 2.6,  carbs: 27.4, fiber: 7.6 },
    lentils:             { calories: 116, protein: 9.0,  fat: 0.4,  carbs: 20.1, fiber: 7.9 },

    // --- Nuts ---
    almonds:             { calories: 579, protein: 21.2, fat: 49.9, carbs: 21.6, fiber: 12.5 },
    walnuts:             { calories: 654, protein: 15.2, fat: 65.2, carbs: 13.7, fiber: 6.7 },
    'peanut butter':     { calories: 588, protein: 25.1, fat: 50.4, carbs: 20.0, fiber: 6.0 },

    // --- Seasonings & zero-cal ---
    salt:                { calories: 0,   protein: 0,    fat: 0,    carbs: 0,    fiber: 0 },
    'black pepper':      { calories: 251, protein: 10.4, fat: 3.3,  carbs: 63.9, fiber: 25.3 },
    cumin:               { calories: 375, protein: 17.8, fat: 22.3, carbs: 44.2, fiber: 10.5 },
    paprika:             { calories: 282, protein: 14.1, fat: 12.9, carbs: 53.9, fiber: 34.9 },
    'chili powder':      { calories: 282, protein: 12.3, fat: 14.3, carbs: 49.7, fiber: 34.8 },
    oregano:             { calories: 265, protein: 9.0,  fat: 4.3,  carbs: 68.9, fiber: 42.5 },
    basil:               { calories: 23,  protein: 3.2,  fat: 0.6,  carbs: 2.7,  fiber: 1.6 },
    cinnamon:            { calories: 247, protein: 4.0,  fat: 1.2,  carbs: 80.6, fiber: 53.1 },
    'garlic powder':     { calories: 331, protein: 16.6, fat: 0.7,  carbs: 72.7, fiber: 9.0 },
    'onion powder':      { calories: 341, protein: 10.4, fat: 1.0,  carbs: 79.1, fiber: 15.2 },
    parsley:             { calories: 36,  protein: 3.0,  fat: 0.8,  carbs: 6.3,  fiber: 3.3 },
    cilantro:            { calories: 23,  protein: 2.1,  fat: 0.5,  carbs: 3.7,  fiber: 2.8 },
    'vanilla extract':   { calories: 288, protein: 0.1,  fat: 0.1,  carbs: 12.7, fiber: 0 },
    vanilla:             { calories: 288, protein: 0.1,  fat: 0.1,  carbs: 12.7, fiber: 0 },

    // --- Condiments & Sauces ---
    'soy sauce':         { calories: 53,  protein: 8.1,  fat: 0.6,  carbs: 4.9,  fiber: 0.8 },
    'fish sauce':        { calories: 35,  protein: 5.1,  fat: 0,    carbs: 3.6,  fiber: 0 },
    vinegar:             { calories: 18,  protein: 0,    fat: 0,    carbs: 0.04, fiber: 0 },
    'apple cider vinegar': { calories: 21, protein: 0,   fat: 0,    carbs: 0.9,  fiber: 0 },
    'balsamic vinegar':  { calories: 88,  protein: 0.5,  fat: 0,    carbs: 17.0, fiber: 0 },
    ketchup:             { calories: 112, protein: 1.7,  fat: 0.1,  carbs: 29.3, fiber: 0.3 },
    mustard:             { calories: 66,  protein: 4.4,  fat: 3.4,  carbs: 5.3,  fiber: 3.3 },
    'dijon mustard':     { calories: 66,  protein: 4.4,  fat: 3.4,  carbs: 5.3,  fiber: 3.3 },
    mayonnaise:          { calories: 680, protein: 1.0,  fat: 74.9, carbs: 0.6,  fiber: 0 },

    // --- Broths ---
    'chicken broth':     { calories: 7,   protein: 1.0,  fat: 0.2,  carbs: 0.3,  fiber: 0 },
    'chicken stock':     { calories: 7,   protein: 1.0,  fat: 0.2,  carbs: 0.3,  fiber: 0 },
    'beef broth':        { calories: 7,   protein: 1.1,  fat: 0.1,  carbs: 0.2,  fiber: 0 },
    'vegetable broth':   { calories: 6,   protein: 0.2,  fat: 0.1,  carbs: 1.1,  fiber: 0 },
    'coconut milk':      { calories: 197, protein: 2.0,  fat: 21.3, carbs: 2.8,  fiber: 0 },

    // --- Miscellaneous ---
    'cocoa powder':      { calories: 228, protein: 19.6, fat: 13.7, carbs: 57.9, fiber: 33.2 },
    'chocolate chips':   { calories: 479, protein: 4.5,  fat: 29.7, carbs: 60.5, fiber: 7.0 },
    water:               { calories: 0,   protein: 0,    fat: 0,    carbs: 0,    fiber: 0 }
  };

  // =========================================================================
  // Unicode fraction map
  // =========================================================================

  var UNICODE_FRACTIONS = {
    '\u00BC': 0.25,  // 1/4
    '\u00BD': 0.5,   // 1/2
    '\u00BE': 0.75,  // 3/4
    '\u2150': 0.143, // 1/7
    '\u2151': 0.111, // 1/9
    '\u2152': 0.1,   // 1/10
    '\u2153': 0.333, // 1/3
    '\u2154': 0.667, // 2/3
    '\u2155': 0.2,   // 1/5
    '\u2156': 0.4,   // 2/5
    '\u2157': 0.6,   // 3/5
    '\u2158': 0.8,   // 4/5
    '\u2159': 0.167, // 1/6
    '\u215A': 0.833, // 5/6
    '\u215B': 0.125, // 1/8
    '\u215C': 0.375, // 3/8
    '\u215D': 0.625, // 5/8
    '\u215E': 0.875  // 7/8
  };

  // =========================================================================
  // Helper functions
  // =========================================================================

  /** Normalize an ingredient name for staple lookup. */
  function normalizeForLookup(name) {
    var cleaned = name.toLowerCase().trim()
      .replace(/\s*\(.*?\)\s*/g, ' ')  // remove parentheticals
      .replace(/,.*$/, '')              // remove everything after comma
      .replace(/\s*\/\s*.+$/, '')       // remove slash alternatives
      .trim();
    return cleaned;
  }

  /** Look up a staple by ingredient name, with plural/alias/prefix fallback. */
  function lookupStaple(ingredientName) {
    var name = normalizeForLookup(ingredientName);

    // Direct match
    if (STAPLES[name]) return STAPLES[name];

    // Try without trailing 's'
    if (name.charAt(name.length - 1) === 's' && STAPLES[name.slice(0, -1)]) {
      return STAPLES[name.slice(0, -1)];
    }

    // Try with trailing 's'
    if (name.charAt(name.length - 1) !== 's' && STAPLES[name + 's']) {
      return STAPLES[name + 's'];
    }

    // Try generic aliases
    if (GENERIC_ALIASES[name] && STAPLES[GENERIC_ALIASES[name]]) {
      return STAPLES[GENERIC_ALIASES[name]];
    }

    // Try stripping suffix noise
    for (var si = 0; si < SUFFIX_NOISE.length; si++) {
      var suffix = SUFFIX_NOISE[si];
      if (name.length > suffix.length && name.indexOf(suffix, name.length - suffix.length) !== -1) {
        var stripped = name.slice(0, -suffix.length);
        if (STAPLES[stripped]) return STAPLES[stripped];
        if (stripped.charAt(stripped.length - 1) === 's' && STAPLES[stripped.slice(0, -1)]) {
          return STAPLES[stripped.slice(0, -1)];
        }
      }
    }

    // Try common prefix removal
    var prefixes = [
      'fresh ', 'dried ', 'frozen ', 'chopped ', 'minced ', 'diced ',
      'sliced ', 'shredded ', 'grated ', 'ground ', 'raw ', 'cooked ',
      'canned ', 'boneless skinless ', 'boneless ', 'skinless ', 'crushed '
    ];
    for (var pi = 0; pi < prefixes.length; pi++) {
      var prefix = prefixes[pi];
      if (name.indexOf(prefix) === 0) {
        var rest = name.slice(prefix.length);
        if (STAPLES[rest]) return STAPLES[rest];
        if (rest.charAt(rest.length - 1) === 's' && STAPLES[rest.slice(0, -1)]) {
          return STAPLES[rest.slice(0, -1)];
        }
        if (GENERIC_ALIASES[rest] && STAPLES[GENERIC_ALIASES[rest]]) {
          return STAPLES[GENERIC_ALIASES[rest]];
        }
      }
    }

    return null;
  }

  /** Get density in grams per teaspoon for an ingredient. */
  function getDensity(ingredientName) {
    var name = normalizeForLookup(ingredientName);
    if (DENSITY_G_PER_TSP[name]) return DENSITY_G_PER_TSP[name];

    var prefixes = ['fresh ', 'dried ', 'frozen ', 'chopped ', 'minced ', 'diced '];
    for (var pi = 0; pi < prefixes.length; pi++) {
      if (name.indexOf(prefixes[pi]) === 0) {
        var rest = name.slice(prefixes[pi].length);
        if (DENSITY_G_PER_TSP[rest]) return DENSITY_G_PER_TSP[rest];
      }
    }

    return DENSITY_G_PER_TSP._default;
  }

  /**
   * Convert quantity + unit + ingredient name to grams.
   * Returns null if conversion is not possible.
   */
  function qtyToGrams(qty, unit, ingredientName) {
    if (qty === null || qty === undefined) return null;

    var numQty = (typeof qty === 'object' && qty.min !== undefined)
      ? (qty.min + qty.max) / 2
      : qty;

    var canonical = unit;

    // Weight units -> direct conversion
    if (canonical && isWeightUnit(canonical)) {
      return numQty * WEIGHT_TO_G[canonical];
    }

    // Volume units -> convert to tsp, then use density
    if (canonical && isVolumeUnit(canonical)) {
      var tsp = numQty * VOLUME_TO_TSP[canonical];
      var density = getDensity(ingredientName);
      return tsp * density;
    }

    // Count-based units
    if (isCountUnit(canonical)) {
      var name = normalizeForLookup(ingredientName);

      // clove of garlic
      if (canonical === 'clove') return numQty * 3;

      // head: garlic ~40g, lettuce/cabbage ~500g
      if (canonical === 'head') {
        if (name.indexOf('garlic') !== -1) return numQty * 40;
        return numQty * 500;
      }

      // stalk of celery
      if (canonical === 'stalk') return numQty * 40;

      // stick of butter
      if (canonical === 'stick' && name.indexOf('butter') !== -1) return numQty * 113;

      // bunch
      if (canonical === 'bunch') {
        var herbs = ['parsley', 'cilantro', 'dill', 'basil', 'thyme', 'rosemary', 'mint'];
        for (var hi = 0; hi < herbs.length; hi++) {
          if (name.indexOf(herbs[hi]) !== -1) return numQty * 30;
        }
        return numQty * 150;
      }

      // sprig (herbs)
      if (canonical === 'sprig') return numQty * 2;

      // size multiplier for large/medium/small
      var sizeMultiplier = canonical === 'large' ? 1.25 : canonical === 'small' ? 0.75 : 1.0;

      // Piece weight lookup
      if (PIECE_WEIGHT_G[name]) return numQty * PIECE_WEIGHT_G[name] * sizeMultiplier;
      if (name.charAt(name.length - 1) === 's' && PIECE_WEIGHT_G[name.slice(0, -1)]) {
        return numQty * PIECE_WEIGHT_G[name.slice(0, -1)] * sizeMultiplier;
      }

      // Unknown count item
      return null;
    }

    // Container units (can, jar, etc.) — can't reliably convert
    return null;
  }

  // =========================================================================
  // Ingredient line parser
  // =========================================================================

  /**
   * Replace unicode fraction characters with their decimal equivalents.
   */
  function replaceUnicodeFractions(str) {
    var result = str;
    var keys = Object.keys(UNICODE_FRACTIONS);
    for (var i = 0; i < keys.length; i++) {
      var ch = keys[i];
      if (result.indexOf(ch) !== -1) {
        // If preceded by a digit, add to it: "1½" -> "1.5"
        result = result.replace(new RegExp('(\\d)\\s*' + ch, 'g'), function (_m, d) {
          return String(Number(d) + UNICODE_FRACTIONS[ch]);
        });
        // Standalone unicode fraction
        result = result.replace(new RegExp(ch, 'g'), String(UNICODE_FRACTIONS[ch]));
      }
    }
    return result;
  }

  /**
   * Parse a raw ingredient line into structured components.
   *
   * @param {string} rawLine - e.g. "1 1/2 cups all-purpose flour, sifted"
   * @returns {{ qty: number|null, unit: string|null, unitCanonical: string|null, ingredient: string, prep: string|null }}
   */
  function parseIngredientLine(rawLine) {
    if (!rawLine || typeof rawLine !== 'string') {
      return { qty: null, unit: null, unitCanonical: null, ingredient: '', prep: null };
    }

    var line = rawLine.trim();

    // Replace unicode fractions
    line = replaceUnicodeFractions(line);

    // Split prep from ingredient on comma
    var prep = null;
    var commaIdx = line.indexOf(',');
    if (commaIdx !== -1) {
      prep = line.slice(commaIdx + 1).trim() || null;
      line = line.slice(0, commaIdx).trim();
    }

    // -----------------------------------------------------------------------
    // Extract quantity from the front
    // -----------------------------------------------------------------------

    // Pattern: number, fraction, mixed number, range, or decimal
    // Examples: "1", "1/2", "1 1/2", "1-2", "1.5", "1 to 2"
    var qtyPattern = /^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/;  // range: "1-2"
    var qtyPatternTo = /^(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/i;  // range: "1 to 2"
    var mixedPattern = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/;                // mixed: "1 1/2"
    var fractionPattern = /^(\d+)\s*\/\s*(\d+)/;                      // fraction: "1/2"
    var decimalPattern = /^(\d+(?:\.\d+)?)/;                          // decimal or integer

    var qty = null;
    var rest = line;

    var m;
    if ((m = line.match(qtyPattern))) {
      qty = (parseFloat(m[1]) + parseFloat(m[2])) / 2;
      rest = line.slice(m[0].length).trim();
    } else if ((m = line.match(qtyPatternTo))) {
      qty = (parseFloat(m[1]) + parseFloat(m[2])) / 2;
      rest = line.slice(m[0].length).trim();
    } else if ((m = line.match(mixedPattern))) {
      qty = parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10);
      rest = line.slice(m[0].length).trim();
    } else if ((m = line.match(fractionPattern))) {
      qty = parseInt(m[1], 10) / parseInt(m[2], 10);
      rest = line.slice(m[0].length).trim();
    } else if ((m = line.match(decimalPattern))) {
      qty = parseFloat(m[1]);
      rest = line.slice(m[0].length).trim();
    }

    // -----------------------------------------------------------------------
    // Extract unit (try multi-word first like "fl oz", "fluid ounce")
    // -----------------------------------------------------------------------

    var unit = null;
    var unitCanonical = null;
    var restLower = rest.toLowerCase();

    // Try two-word units first
    var twoWordMatch = restLower.match(/^(fl\s*oz|fluid\s+ounces?)\b/i);
    if (twoWordMatch) {
      var twoWordKey = twoWordMatch[1].toLowerCase().replace(/\s+/g, ' ');
      if (UNIT_MAP[twoWordKey]) {
        unit = twoWordMatch[1];
        unitCanonical = UNIT_MAP[twoWordKey];
        rest = rest.slice(twoWordMatch[0].length).trim();
      }
    }

    if (!unitCanonical) {
      // Try single-word unit: first word of rest
      var wordMatch = rest.match(/^([a-zA-Z]+)\.?\b/);
      if (wordMatch) {
        var candidate = wordMatch[1].toLowerCase();
        // Handle period after abbreviation (e.g. "tsp.")
        if (UNIT_MAP[candidate]) {
          unit = wordMatch[1];
          unitCanonical = UNIT_MAP[candidate];
          // Remove the unit word from rest. Also consume a trailing period and "of"
          rest = rest.slice(wordMatch[0].length).replace(/^\./, '').trim();
          // Consume "of" if present: "cup of flour" -> "flour"
          rest = rest.replace(/^of\b\s*/i, '').trim();
        }
      }
    } else {
      // Consume "of" after multi-word unit
      rest = rest.replace(/^of\b\s*/i, '').trim();
    }

    // The remaining text is the ingredient name
    var ingredient = rest.trim();

    // If no ingredient was parsed, use the original line minus qty
    if (!ingredient) {
      ingredient = rawLine.trim();
    }

    return {
      qty: qty,
      unit: unit,
      unitCanonical: unitCanonical,
      ingredient: ingredient,
      prep: prep
    };
  }

  // =========================================================================
  // Recipe nutrition estimation
  // =========================================================================

  /**
   * Estimate nutrition for an array of raw ingredient strings.
   *
   * @param {string[]} rawIngredients - Array of raw ingredient lines
   * @param {number} servings - Number of servings the recipe makes
   * @returns {{ perServing: {calories,protein,fat,carbs,fiber}, matched: number, total: number }}
   */
  function estimateRecipeNutrition(rawIngredients, servings) {
    if (!rawIngredients || rawIngredients.length === 0) {
      return { perServing: { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }, matched: 0, total: 0 };
    }

    servings = servings || 1;
    if (servings < 1) servings = 1;

    var totalMacros = { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
    var matched = 0;
    var total = rawIngredients.length;

    for (var i = 0; i < rawIngredients.length; i++) {
      var raw = rawIngredients[i];
      if (!raw || typeof raw !== 'string') continue;

      // Skip lines that are just "salt and pepper to taste" etc.
      var lower = raw.toLowerCase().trim();
      if (lower === 'salt and pepper to taste' || lower === 'salt and pepper' ||
          lower === 'salt to taste' || lower === 'pepper to taste' ||
          lower === 'cooking spray' || lower === 'nonstick spray' ||
          lower === 'water as needed' || lower === 'ice') {
        matched++;
        continue;
      }

      var parsed = parseIngredientLine(raw);
      var ingredientName = parsed.ingredient;
      var staple = lookupStaple(ingredientName);

      if (!staple) continue;

      var grams = qtyToGrams(parsed.qty, parsed.unitCanonical, ingredientName);
      if (grams === null || grams <= 0) continue;

      var factor = grams / 100;
      totalMacros.calories += staple.calories * factor;
      totalMacros.protein  += staple.protein * factor;
      totalMacros.fat      += staple.fat * factor;
      totalMacros.carbs    += staple.carbs * factor;
      totalMacros.fiber    += staple.fiber * factor;
      matched++;
    }

    var perServing = {
      calories: Math.round(totalMacros.calories / servings),
      protein:  Math.round(totalMacros.protein / servings * 10) / 10,
      fat:      Math.round(totalMacros.fat / servings * 10) / 10,
      carbs:    Math.round(totalMacros.carbs / servings * 10) / 10,
      fiber:    Math.round(totalMacros.fiber / servings * 10) / 10
    };

    return {
      perServing: perServing,
      matched: matched,
      total: total
    };
  }

  // =========================================================================
  // Scale quantity helper
  // =========================================================================

  /**
   * Scale a numeric quantity from originalServings to newServings.
   *
   * @param {number} qty - The original quantity value
   * @param {number} originalServings - The recipe's original serving count
   * @param {number} newServings - The desired serving count
   * @returns {number} The scaled quantity
   */
  function scaleQuantity(qty, originalServings, newServings) {
    if (!qty || !originalServings || originalServings <= 0) return qty || 0;
    if (!newServings || newServings <= 0) return 0;
    return qty * (newServings / originalServings);
  }

  // =========================================================================
  // Expose on window.MiseNutrition
  // =========================================================================

  window.MiseNutrition = {
    parseIngredientLine: parseIngredientLine,
    estimateRecipeNutrition: estimateRecipeNutrition,
    scaleQuantity: scaleQuantity,

    // Expose internals for testing / advanced use
    _internals: {
      UNIT_MAP: UNIT_MAP,
      VOLUME_TO_TSP: VOLUME_TO_TSP,
      WEIGHT_TO_G: WEIGHT_TO_G,
      PIECE_WEIGHT_G: PIECE_WEIGHT_G,
      DENSITY_G_PER_TSP: DENSITY_G_PER_TSP,
      STAPLES: STAPLES,
      GENERIC_ALIASES: GENERIC_ALIASES,
      SUFFIX_NOISE: SUFFIX_NOISE,
      normalizeForLookup: normalizeForLookup,
      lookupStaple: lookupStaple,
      getDensity: getDensity,
      qtyToGrams: qtyToGrams
    }
  };

})();
