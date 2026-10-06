// DEMO MODE: canned, hand-written takes. No AI, no network.
// Voice: dry, deadpan, short. Verdicts are 2–6 words; good/fix lines stay under ~8.
// Every sample has at least 4 takes per mode, drawn from a shuffled bag so the
// same take never shows twice in a row (and nothing repeats until the bag is empty).
// Demo takes never look at what's actually in the photo. The UI says so with a banner.

const R = (score, headline, compliment, fix) => ({ score, headline, compliment, fix });
const M = (verdict, dishName, description, price, pairing, spotted) => ({ verdict, dishName, description, chefNotes: '', price, pairing, spotted });
const F = (verdict, score, specialName, description, ingredients, steps, price, note) => ({ verdict, score, specialName, description, ingredients, steps, price, note });

const SAMPLE = {
  noodles: {
    menu: [
      M('Instant noodles. $189. Tonight only.', 'Three-Minute Noodles, Timed Exactly', 'Noodles, one egg, some green onion. Served hot.', '$189', 'Tap water, with lemon', ['instant noodles', 'egg', 'green onion']),
      M('The egg is the whole budget.', 'Ramen, Hold the Effort', 'Wavy noodles. Salty broth. One very busy egg.', '$240 (egg extra)', 'Flat lemonade', ['noodles', 'egg', 'green onion']),
      M('Microwaved. Served with conviction.', 'Noodle Bowl, Studio Apartment Edition', 'Broth, noodles, a scatter of green onion.', '$310', 'Whatever’s in the fridge door', ['noodles', 'green onion']),
      M('The waiter will pretend.', 'Tuesday Ramen, Tasting Size', 'One bowl. One egg. Big confidence.', '$420 (market price)', 'Sparkling tap water', ['noodles', 'egg']),
    ],
    roast: [
      R(6, 'The egg is carrying this.', 'That egg is perfect.', 'Nest the noodles. Egg on top.'),
      R(5, 'Noodles. Everywhere. Why.', 'The green onion tried.', 'Use a smaller bowl.'),
      R(4, 'The broth looks tired.', 'Nice jammy yolk.', 'Wipe the rim. Twirl the noodles.'),
      R(7, 'Okay. Okay. Fine.', 'Good color on the egg.', 'More green onion. Center it.'),
    ],
    fridge: [],
  },
  beans: {
    menu: [
      M('Toast, priced like rent.', 'Beans on Toast, Brunch Edition', 'Two slices of toast under a lot of beans.', '$96 a slice', 'Strong tea, milk first', ['baked beans', 'toast']),
      M('Beans. Plural. Expensive.', 'The Bean Landslide', 'Beans sliding off toast. On purpose, apparently.', '$312', 'Fresh orange juice', ['baked beans', 'toast']),
      M('The toast is a plate now.', 'Sourdough, Fully Submerged', 'Toast, mostly hidden. Beans, mostly everywhere.', '$140 (sides extra)', 'More toast', ['baked beans', 'toast']),
      M('Breakfast. With a markup.', 'Saucy Bean Tartine', 'Toasted bread. Warm beans. No garnish.', '$188', 'Black coffee', ['beans', 'toast']),
    ],
    roast: [
      R(4, 'The beans won.', 'Toast color is perfect.', 'Beans on one slice only.'),
      R(3, 'The toast deserved better.', 'Honest portion.', 'Keep one slice crispy.'),
      R(5, 'Orange. All of it.', 'Nice crust on the bread.', 'Add something green.'),
      R(2, 'Eat it fast.', 'It’s hot, at least.', 'Less sauce. Smaller plate.'),
    ],
    fridge: [],
  },
  pie: {
    menu: [
      M('One pie. Four hundred dollars.', 'Meat Pie, Ketchup Zigzag', 'Golden pastry, beef filling, one bold ketchup line.', '$420', 'A paper bag', ['meat pie', 'ketchup']),
      M('The ketchup is the garnish.', 'Pastry Fortress, Sauced', 'Crimped crust. Ketchup on top. That’s the dish.', '$265', 'Cold lemonade', ['pie', 'ketchup']),
      M('Gas station, but candlelit.', 'Hand Pie, Reserve List', 'One pie. One sauce. No plate needed.', '$199 (halftime)', 'Sparkling water', ['meat pie', 'ketchup']),
      M('Served whole. No sharing.', 'Beef Pie, Chef’s Table', 'Flaky top, rich middle, ketchup everywhere.', '$350', 'A second pie', ['pie', 'ketchup']),
    ],
    roast: [
      R(7, 'The ketchup made a choice.', 'That crust is golden.', 'Ketchup on the side.'),
      R(8, 'Annoyingly decent pastry.', 'Proud, even crimp.', 'Use a plate. Any plate.'),
      R(6, 'The zigzag is a lot.', 'Great color on top.', 'One neat dot of sauce.'),
      R(9, 'No notes. Rude.', 'Flawless crust.', 'Maybe a napkin.'),
    ],
    fridge: [],
  },
  fridge: {
    menu: [
      M('The fridge, plated. $1,850.', 'Still Life: Inside the Fridge', 'Milk, eggs, cheese, tomatoes. Served chilled.', '$1,850', 'The open-door breeze', ['milk', 'eggs', 'cheese', 'tomatoes', 'carrots']),
      M('Everything. Nothing cooked.', 'Cold Buffet, Self-Serve', 'Raw vegetables. Dairy. One brave jar.', '$990', 'Milk, from the carton', ['milk', 'eggs', 'lettuce', 'bell pepper']),
      M('Groceries, with a cover charge.', 'The Crisper Drawer Tasting', 'Carrots, lettuce, tomatoes. Arranged by gravity.', '$640', 'Cold water', ['carrots', 'lettuce', 'tomatoes']),
      M('The jar in back stays.', 'Fridge Door Omakase', 'Condiments, presented with confidence.', '$2,400 (power included)', 'Pickle brine', ['jam', 'cheese', 'eggs']),
    ],
    roast: [
      R(5, 'The crisper drawer is working.', 'Those tomatoes are great.', 'Dairy up top. Leftovers front.'),
      R(6, 'Fine. Just fine.', 'Real vegetables. Noted.', 'Toss the mystery jar.'),
      R(4, 'Half a lemon. Since March.', 'The eggs look fresh.', 'Eat the lettuce today.'),
      R(7, 'Annoyingly organized.', 'Good shelf discipline.', 'Fewer jars. More dinner.'),
    ],
    fridge: [
      F('The eggs are carrying this.', 7, 'Fridge Omelet, Side of Slaw', 'Cheese omelet. Tomato. Crunchy carrot slaw.', ['eggs', 'cheese', 'tomatoes', 'lettuce', 'carrots', 'butter'], ['Whisk three eggs.', 'Cook in butter, add cheese, fold.', 'Toss carrot and lettuce with lemon.'], '$64', 'The pepper waits till next time.'),
      F('Tonight: eggs. Again.', 6, 'Weeknight Shakshuka', 'Eggs in tomato and pepper. Cheese on top.', ['eggs', 'tomatoes', 'bell pepper', 'cheese'], ['Soften pepper and tomato.', 'Crack in eggs. Cover.', 'Cheese on top when set.'], '$78', 'Dunk bread in it.'),
      F('Vegetables. Actual ones.', 8, 'Crisper Drawer Stir-Fry', 'Pepper, carrot, egg. Hot pan, fast.', ['bell pepper', 'carrots', 'eggs', 'rice'], ['Slice everything thin.', 'Hot oil. Vegetables first.', 'Push aside, scramble egg, mix.'], '$58', 'Day-old rice works better.'),
      F('Cheese. Bread. Decisions.', 5, 'Grilled Cheese and Tomato', 'Melty cheese. Sliced tomato. Crisp bread.', ['cheese', 'tomatoes', 'butter', 'bread'], ['Butter the outside.', 'Cheese and tomato inside.', 'Low heat till it oozes.'], '$41', 'Low heat. Be patient.'),
    ],
  },
};

const MENU_BY_TONE = {
  warm: [
    M('Red sauce. Big feelings.', 'Red Sauce Situation', 'Tomato, heat, one moment of panic.', '$275', 'Lime soda', []),
    M('Everything here wants attention.', 'The Main Character Plate', 'Loud, red, unapologetic.', '$318', 'Raspberry fizz', []),
    M('Spicy. Priced like it.', 'Chili Plate, Reserved', 'Red on red. Bring water.', '$240', 'A lot of water', []),
    M('The sauce runs this place.', 'Tomato Forward Special', 'Sauce first. Food somewhere under it.', '$199', 'Iced tea', []),
  ],
  golden: [
    M('Beige. Served with conviction.', 'House Golden Crunch', 'Fried. Crunchy. Very sure of itself.', '$199', 'Iced tea', []),
    M('Crunch, with a markup.', 'Golden Hour Plate', 'Browned, glistening, hot.', '$249', 'Ginger beer', []),
    M('Microwaved. Plated anyway.', 'Toasted Tasting Course', 'Warm, golden, mostly carbs.', '$188', 'Sparkling water', []),
    M('The waiter will pretend.', 'Crispy Chef’s Choice', 'Gold on gold. No green.', '$310', 'Lemonade', []),
  ],
  green: [
    M('Leaves. Paid for, somehow.', 'Secret Garden Plate', 'Greens and good intentions.', '$165', 'Cucumber water', []),
    M('A salad, priced like a car.', 'Monday Fresh-Start Salad', 'Crisp, green, briefly virtuous.', '$140', 'Smug kombucha', []),
    M('Green. Suspiciously healthy.', 'Garden Herb Situation', 'Leaves, herbs, one radish.', '$210', 'Mint water', []),
    M('Lettuce, with a cover charge.', 'Garden Salad, Tasting Size', 'A pile of green. Dressing optional.', '$95', 'Lime water', []),
  ],
  earthy: [
    M('Brown. Expensive brown.', 'Mystery Stew Deluxe', 'Rich, cozy, brown on brown.', '$288', 'Hot chocolate', []),
    M('Slow-cooked. Or microwaved.', 'Slow-Cooked Deep Thoughts', 'Everything lost its shape. Nicely.', '$356', 'Black tea', []),
    M('The gravy is the plan.', 'Comfort Bowl, Reserve', 'Warm, heavy, brown.', '$222', 'More gravy', []),
    M('Stew, with a dress code.', 'Braise of the Evening', 'Dark, saucy, mopping required.', '$410', 'Bread. All of it.', []),
  ],
  pale: [
    M('White on white. Bold.', 'Extremely Minimal Plate', 'Pale, quiet, nearly the plate.', '$410', 'Milk, seriously', []),
    M('No vegetables were invited.', 'Cloud of Carbs', 'Soft, fluffy, beige.', '$222', 'Oat latte', []),
    M('Pale. Priced for the concept.', 'Monochrome Tasting', 'Color was considered. Rejected.', '$380', 'Still water', []),
    M('Carbs, plated like art.', 'Butter Study No. 4', 'Soft, white, faintly buttery.', '$260', 'Vanilla milk', []),
  ],
  dark: [
    M('Too dark to judge. Judging.', 'Midnight Mystery Plate', 'Moody. Unclear. Possibly food.', '$499', 'Espresso', []),
    M('The bulb blew. Still $499.', 'Candlelit Guessing Game', 'Something is there. Probably dinner.', '$499', 'Flashlight', []),
    M('Black on black. Fearless.', 'Shadow Tasting Menu', 'Dark plate. Darker food.', '$320', 'Cold brew', []),
    M('Turn on a light, then pay.', 'Night Shift Special', 'Mostly shadow. Some sauce.', '$275', 'Hot tea', []),
  ],
};

const ROASTS = [
  R(3, 'Beige. All of it.', 'It’s probably delicious.', 'Pick one hero. Build around it.'),
  R(5, 'It’s food.', 'Generous portion.', 'Add something green.'),
  R(8, 'Annoyingly decent.', 'Real restaurant energy.', 'Wipe the rim. That’s a nine.'),
  R(2, 'You plated that on purpose?', 'Bold, at least.', 'Spread it out. Give it room.'),
  R(6, 'The sauce went rogue.', 'Main thing is cooked well.', 'Sauce under, not across.'),
  R(4, 'That garnish is doing nothing.', 'Honest and filling.', 'Use a smaller plate.'),
  R(7, 'Okay. Okay.', 'Nice color balance.', 'Fresh herbs on top.'),
  R(9, 'I’m upset about it.', 'Clean plate. Real plan.', 'Nothing. Annoyingly.'),
  R(1, 'No.', 'You took a photo. Brave.', 'Start over. Slower.'),
];

const FRIDGE_GENERIC = [
  F('Leftovers. A lot of them.', 5, 'Leftover Frittata', 'Whatever’s perky, folded into eggs.', ['eggs', 'leftover veggies', 'cheese'], ['Chop the perky veggies.', 'Pour eggs over them.', 'Cheese on top. Broil.'], '$72', 'Demo can’t see your fridge. House pick.'),
  F('Rice from yesterday. Perfect.', 7, 'Next-Day Fried Rice', 'Old rice, hot pan, egg on top.', ['rice', 'veggies', 'eggs', 'soy sauce'], ['Heat oil till it shimmers.', 'Veggies, then rice, then soy.', 'Fried egg on top.'], '$58', 'Old rice fries better.'),
  F('Eleven condiments. No dinner.', 3, 'Fridge Door Grilled Cheese', 'Cheese, bread, every pickle you own.', ['bread', 'cheese', 'butter', 'pickles'], ['Butter the outside.', 'Load it up.', 'Low heat till it oozes.'], '$49', 'If it oozes, it counts.'),
  F('Pasta. Obviously pasta.', 6, 'Clean-Out Pasta', 'Pasta, soft veggies, a lot of cheese.', ['pasta', 'veggies', 'butter', 'cheese'], ['Boil in salty water.', 'Soften veggies in butter.', 'Toss with cheese and pasta water.'], '$66', 'Keep the pasta water.'),
  F('Who needs four hot sauces?', 4, 'Hot Sauce Egg Tacos', 'Scrambled eggs, tortillas, sauce roulette.', ['eggs', 'tortillas', 'hot sauce', 'cheese'], ['Scramble eggs soft.', 'Warm the tortillas.', 'Pick one sauce. One.'], '$38', 'One sauce. Commit.'),
];

const TONE_FALLBACK = 'golden';

export function analyseImage(canvas) {
  const s = 32;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(canvas, 0, 0, s, s);
  const d = x.getImageData(0, 0, s, s).data;
  let r = 0, g = 0, b = 0, sat = 0, hash = 2166136261;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]; g += d[i + 1]; b += d[i + 2];
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    sat += mx ? (mx - mn) / mx : 0;
    hash = Math.imul(hash ^ (d[i] >> 3) ^ (d[i + 1] << 2) ^ (d[i + 2] << 7), 16777619) >>> 0;
  }
  const n = d.length / 4;
  r /= n; g /= n; b /= n; sat /= n;
  const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  let tone;
  if (brightness < 0.25) tone = 'dark';
  else if (sat < 0.16 && brightness > 0.6) tone = 'pale';
  else if (g > r * 1.02 && g > b) tone = 'green';
  else if (r > g * 1.35 && r > b * 1.35) tone = 'warm';
  else if (r > b * 1.25 && brightness < 0.45) tone = 'earthy';
  else tone = 'golden';
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b), brightness, saturation: sat, tone, seed: hash };
}

// Shuffled bag per key: no take repeats until the bag is empty, and a fresh bag
// never starts with the take that was just shown (also across reloads, via sessionStorage).
const bags = new Map();
const LAST_KEY = 'snootfood.lastTake.v1';
let last = {};
try { last = JSON.parse(sessionStorage.getItem(LAST_KEY) || '{}') || {}; } catch { last = {}; }
function draw(key, n) {
  let bag = bags.get(key);
  if (!bag || !bag.length) {
    bag = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    if (n > 1 && bag[n - 1] === last[key]) [bag[0], bag[n - 1]] = [bag[n - 1], bag[0]];
    bags.set(key, bag);
  }
  const i = bag.pop();
  last[key] = i;
  try { sessionStorage.setItem(LAST_KEY, JSON.stringify(last)); } catch { /* private mode */ }
  return i;
}
const take = (key, arr) => ({ ...arr[draw(key, arr.length)] });

// How many takes each sample has per mode (used by the tests).
export function takeCounts() {
  const out = {};
  for (const id of Object.keys(SAMPLE)) out[id] = { menu: SAMPLE[id].menu.length, roast: SAMPLE[id].roast.length, fridge: (SAMPLE[id].fridge.length || FRIDGE_GENERIC.length) };
  out.tones = Object.fromEntries(Object.entries(MENU_BY_TONE).map(([k, v]) => [k, v.length]));
  out.roasts = ROASTS.length;
  return out;
}

export function demoResult(mode, features, sampleId) {
  const sample = sampleId && SAMPLE[sampleId];
  const tone = MENU_BY_TONE[features?.tone] ? features.tone : TONE_FALLBACK;
  if (mode === 'menu') return sample ? take(`${sampleId}:menu`, sample.menu) : take(`tone-${tone}:menu`, MENU_BY_TONE[tone]);
  if (mode === 'roast') return sample ? take(`${sampleId}:roast`, sample.roast) : take('photo:roast', ROASTS);
  if (mode === 'fridge') return sample?.fridge.length ? take(`${sampleId}:fridge`, sample.fridge) : take('generic:fridge', FRIDGE_GENERIC);
  throw new Error('Unknown mode ' + mode);
}

export const SAMPLES = [
  { id: 'noodles', src: 'samples/noodles.jpg', label: 'Instant noodles' },
  { id: 'beans', src: 'samples/beans.jpg', label: 'Beans on toast' },
  { id: 'pie', src: 'samples/pie.jpg', label: 'Meat pie with ketchup' },
  { id: 'fridge', src: 'samples/fridge.jpg', label: 'Fridge haul' },
];
