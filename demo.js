// DEMO MODE: canned, hand-written results. No AI, no network.
// Picked from simple image features (average colour / brightness) plus a seed,
// so the same photo gives a stable result until you tap “Another take”.

const SAMPLE = {
  noodles: {
    menu: [
      { dishName: 'Nouilles Instantanées, Trois Minutes Exactement', description: 'Hand-liberated from their foil sachet, these heritage wheat ribbons recline in a bronze broth of mysterious provenance, crowned with a soft egg and a confetti of spring onion.', chefNotes: 'The flavour sachet was opened with a single, decisive tear. We do not discuss the second sachet.', price: '$189', pairing: 'Tap water, served with a judgemental slice of lemon', spotted: ['instant noodles', 'egg', 'spring onion'] },
      { dishName: 'Ramen of the Lonely Tuesday', description: 'A meditation on convenience. Crinkled noodles bask in a jacuzzi of sodium, attended by a single egg who has seen things.', chefNotes: 'Best enjoyed standing over the sink, as the ancients intended.', price: '$240 (egg is extra)', pairing: 'A flat lemonade, left open since Sunday', spotted: ['noodles', 'egg', 'spring onion'] },
    ],
    roast: [
      { score: 6, headline: 'The egg is carrying this entire team', roast: 'Zut alors. You have arranged the noodles like a garden hose that lost an argument. The broth is the colour of a hallway carpet. And yet… the egg. The egg sits there like a little sun, trying its best.', compliment: 'The spring onion is scattered with genuine conviction.', fix: 'Twirl the noodles into a nest and sit the egg on top.' },
    ],
    fridge: [],
  },
  beans: {
    menu: [
      { dishName: 'Haricots à la Tomate sur Pain Grillé', description: 'Slow-tinned legumes in a velvety tomato reduction, cascading over twin planks of artisanal sliced loaf toasted to a confident amber.', chefNotes: 'Our toast is rested for nine seconds, then buttered with intent. The beans are warmed in a vessel we call “the little pot”.', price: '$96 per slice', pairing: 'A strong cup of tea, milk in first (we will fight you)', spotted: ['baked beans', 'toast'] },
      { dishName: 'The Bean Cascade, Deconstructed Brunch', description: 'An avalanche of baked beans tumbling off sourdough cliffs into a porcelain void. Rustic. Fearless. Slightly runny.', chefNotes: 'The overlapping toast represents two friends who will never be apart, mostly due to sauce.', price: '$312 (sides not included)', pairing: 'Freshly squeezed orange juice, pulp optional', spotted: ['baked beans', 'toast'] },
    ],
    roast: [
      { score: 4, headline: 'This toast is drowning, call a lifeguard', roast: 'Mon dieu, the beans have staged a hostile takeover. I can no longer see the toast, only a smear of orange ambition. It looks less like breakfast and more like a tiny landslide on a plate.', compliment: 'The toast colour is honestly spot on.', fix: 'Spoon the beans on one slice and leave the other crisp beside it.' },
    ],
    fridge: [],
  },
  pie: {
    menu: [
      { dishName: 'Tourte de Bœuf, Coulis de Tomate Vandalisé', description: 'A golden shortcrust vessel guarding a rich beef interior, finished tableside with an expressive lightning bolt of tomato sauce.', chefNotes: 'The sauce was applied in one fearless motion. Our pastry chef wept. Our sauce chef did a lap of the kitchen.', price: '$420 (half-time special)', pairing: 'A paper bag, crumpled to room temperature', spotted: ['meat pie', 'tomato sauce'] },
    ],
    roast: [
      { score: 7, headline: 'Is that sauce or a heart-rate monitor?', roast: 'Sacré bleu, the tomato sauce zigzag looks like the pie is having a very exciting medical reading. But the pastry is golden, the crimp is proud, and frankly I respect a pie that does not need a plate.', compliment: 'That crust has a better tan than my sous-chef.', fix: 'Sauce in a neat dot on the side so the pastry can shine.' },
    ],
    fridge: [],
  },
  fridge: {
    menu: [
      { dishName: 'Still Life: Interior of a Refrigerator', description: 'A daring installation piece. Milk, eggs, a wedge of cheese and a crisper drawer of quiet optimism, all served at precisely four degrees.', chefNotes: 'The jar at the back has been there since the Before Times. It stays. It is part of the art.', price: '$1,850 (power bill included)', pairing: 'The cool breeze when the door stays open too long', spotted: ['milk', 'eggs', 'cheese', 'tomatoes', 'carrots', 'lettuce', 'capsicum'] },
    ],
    roast: [
      { score: 5, headline: 'The crisper drawer is doing all the work', roast: 'Alors, the top shelf is organised like a dinner party where nobody knows each other. The cheese sits alone in a corner. The jam jar is whispering to the leftovers. But the vegetables, they are fresh, they are bright, they have hope.', compliment: 'Those tomatoes are genuinely gorgeous.', fix: 'Group like with like: dairy up top, leftovers front and centre.' },
    ],
    fridge: [
      { specialName: 'Omelette du Frigo, Jardin Croquant', description: 'A fluffy free-range omelette folded around melted cheese and blistered tomato, served with a crisp carrot and lettuce slaw dressed in lemon.', ingredients: ['eggs', 'cheese', 'tomatoes', 'lettuce', 'carrots', 'lemon', 'butter'], steps: ['Whisk three eggs with salt and pepper.', 'Cook in butter, add cheese and tomato, fold.', 'Toss grated carrot and lettuce with lemon juice.'], price: '$64 (tonight only)', note: 'The capsicum asked to be included. We said next time. It took it well.' },
      { specialName: 'Shakshuka of Last Week’s Ambitions', description: 'Eggs gently poached in a sauce of tomato and capsicum, finished with crumbled cheese and a side of buttered toast soldiers.', ingredients: ['eggs', 'tomatoes', 'capsicum', 'cheese', 'butter'], steps: ['Soften chopped capsicum and tomato in oil.', 'Make wells and crack in the eggs; cover.', 'Cook until set, crumble cheese on top.'], price: '$78 (bread basket $14)', note: 'Use the leftovers in the container as a mystery side. Life is an adventure.' },
    ],
  },
};

const MENU_BY_TONE = {
  warm: [
    { dishName: 'Symphonie de Sauce Rouge', description: 'A passionate red-hued composition that speaks of sun-ripened tomatoes and at least one moment of panic near the stove.', chefNotes: 'Plated to the sound of a smoke alarm, which our kitchen considers applause.', price: '$275', pairing: 'Sparkling water with a defiant wedge of lime', spotted: [] },
    { dishName: 'Tartare of Wild Ambition', description: 'Bold, crimson, unapologetic. Every element on this plate believed it was the main character, and honestly? Valid.', chefNotes: 'Garnish was considered, then rejected, then reconsidered. You are looking at the compromise.', price: '$318 (sharing is frowned upon)', pairing: 'A chilled glass of raspberry cordial, double strength', spotted: [] },
  ],
  golden: [
    { dishName: 'Doré Croustillant à la Maison', description: 'Bronzed to the exact shade of a summer afternoon at the beach, this golden creation crackles with the confidence of a dish that knows it is crunchy.', chefNotes: 'Our fry chef has a certificate in “vibes”. It is laminated.', price: '$199', pairing: 'Iced tea, stirred clockwise only', spotted: [] },
    { dishName: 'Golden Hour on a Plate', description: 'Caramelised, glistening and lit like an influencer at sunset. Served at the precise temperature of “careful, it’s hot”.', chefNotes: 'If it is beige, it is delicious. This is the founding philosophy of Maison Snoot.', price: '$249 (fork rental extra)', pairing: 'A fizzy ginger beer with notes of nostalgia', spotted: [] },
  ],
  green: [
    { dishName: 'Jardin Secret aux Herbes Fraîches', description: 'A verdant landscape of leaves and good intentions, foraged from the nearest supermarket with tremendous bravery.', chefNotes: 'Each leaf was individually told it was doing a great job.', price: '$165 (dressing on request, sigh)', pairing: 'Cucumber water, served with a smug smile', spotted: [] },
    { dishName: 'Salade de la Résolution du Lundi', description: 'Crisp, green and hopeful, this salad represents a fresh start, a new you, and the brief moment before ordering chips anyway.', chefNotes: 'We recommend eating it slowly while thinking about dessert.', price: '$140 (dessert sold separately, inevitably)', pairing: 'A kombucha that is slightly too pleased with itself', spotted: [] },
  ],
  earthy: [
    { dishName: 'Ragoût Mystérieux du Terroir', description: 'A deep, earthy, brown-on-brown study of comfort. Rich in flavour, rich in history, rich in the colour of a lovingly worn leather couch.', chefNotes: 'Brown food is the little black dress of cuisine. It goes with everything.', price: '$288 (bread to mop: priceless)', pairing: 'Hot chocolate with a single heroic marshmallow', spotted: [] },
    { dishName: 'Slow-Braised Contemplation', description: 'Cooked low and slow until every ingredient forgot its original shape and became one harmonious, cosy puddle of joy.', chefNotes: 'Simmered for hours, or possibly reheated for four minutes. We prefer not to say.', price: '$356', pairing: 'Builder’s tea, steeped until it can stand a spoon up', spotted: [] },
  ],
  pale: [
    { dishName: 'Blanc sur Blanc, Minimalisme Total', description: 'A daring monochrome statement. Pale, subtle and so understated that one might mistake it for the plate itself.', chefNotes: 'Colour is a distraction. Our chef has not seen paprika since 2019.', price: '$410 (for the concept alone)', pairing: 'A glass of milk, served with gravitas', spotted: [] },
    { dishName: 'Cloud of Carbohydrate Dreams', description: 'Soft, fluffy, beige and beautiful. A hug in edible form for anyone who has had a long week.', chefNotes: 'No vegetables were harmed in the making of this dish. None were involved at all.', price: '$222', pairing: 'Warm vanilla soy latte, extra foam, extra drama', spotted: [] },
  ],
  dark: [
    { dishName: 'Noir Profond, Mystère de Minuit', description: 'Dramatic, moody and lit like a detective film. What is it? Where does it end? Only the chef knows, and the chef has gone home.', chefNotes: 'We plate by candlelight for ambience, and also because the bulb blew.', price: '$499 (torch hire $20)', pairing: 'Espresso, served with an air of mystery', spotted: [] },
  ],
};

const ROASTS = [
  { score: 3, headline: 'I have seen tidier crime scenes', roast: 'Mon dieu. This plate looks like the food was dropped from a great height and simply accepted its fate. There is no structure, no plan, only chaos and a faint sense of regret.', compliment: 'It does look like it would taste great, annoyingly.', fix: 'Pick one hero item and build everything around it.' },
  { score: 5, headline: 'Perfectly average, like a beige cardigan', roast: 'It is fine. It is food. It sits there on the plate like it is waiting for a bus. Nobody will write poetry about it, but nobody will call the authorities either.', compliment: 'Portion size shows real generosity of spirit.', fix: 'Add something green on top. Anything. A leaf. Please.' },
  { score: 8, headline: 'Ugh. Fine. This is actually good.', roast: 'I came here to roast and you have given me… competence. The colours work, the arrangement has intent, and I am furious about it. Do not let this go to your head.', compliment: 'Genuinely restaurant-worthy. I hate saying that.', fix: 'Wipe the rim of the plate and it is a nine.' },
  { score: 2, headline: 'The plate is begging for a lawyer', roast: 'Sacré bleu, what has the plate done to deserve this? Everything is piled in the middle like a game of food Jenga that has already lost. Even the fork looks nervous.', compliment: 'Bold. Fearless. Wrong, but fearless.', fix: 'Spread it out and give each food some personal space.' },
  { score: 6, headline: 'Close, but the sauce went rogue', roast: 'There is a good idea in here, hiding behind a sauce that has clearly escaped custody. It is smeared like it was trying to sign its own name. Nearly there, chef.', compliment: 'The main element is cooked with real care.', fix: 'Sauce goes under the food, not across the plate like graffiti.' },
  { score: 4, headline: 'This is giving school camp canteen', roast: 'Alors. It has the energy of food served on a tray at 7am by someone who also runs the canoeing. Nutritious? Possibly. Gorgeous? We will not be discussing that today.', compliment: 'Comforting, honest and clearly made with love.', fix: 'Use a smaller plate so it looks abundant, not lonely.' },
  { score: 7, headline: 'Respectable. I am almost not grumpy.', roast: 'The colours are cheerful and the portions are tidy. My moustache twitched with something like approval. Do not tell the brigade. They will expect compliments now.', compliment: 'Lovely colour balance, very appetising.', fix: 'A sprinkle of fresh herbs would lift the whole thing.' },
  { score: 1, headline: 'Is this food or a modern art protest?', roast: 'I have stared at this for a long time and I still cannot tell which way is up. It might be dinner. It might be a message. Either way, my toque has wilted.', compliment: 'I admire the confidence it took to photograph this.', fix: 'Start again, but slower, and with a plan.' },
];

const FRIDGE_GENERIC = [
  { specialName: 'Frittata of Forgotten Treasures', description: 'Whatever was hiding in the crisper, folded into golden eggs and finished under a hot grill until puffed and proud.', ingredients: ['eggs', 'leftover vegetables', 'cheese'], steps: ['Chop any veg that still looks perky.', 'Pour beaten eggs over the veg in a hot pan.', 'Top with cheese and grill until golden.'], price: '$72 (market price, market is your fridge)', note: 'Demo mode cannot see your fridge, so this is our house favourite. Add a key for a real reading.' },
  { specialName: 'Fried Rice du Lendemain', description: 'Day-old rice reborn in a very hot pan with a rainbow of chopped vegetables, a splash of soy and a fried egg on top for drama.', ingredients: ['rice', 'vegetables', 'eggs', 'soy sauce'], steps: ['Heat oil until it shimmers.', 'Fry veg, then the rice, then soy.', 'Crown with a fried egg.'], price: '$58', note: 'The best fried rice is made with yesterday’s rice and today’s confidence.' },
  { specialName: 'Toastie Supreme, Fromage Fondu', description: 'A molten cheese toastie upgraded with whatever spreads, slices and pickles the fridge door has been hoarding.', ingredients: ['bread', 'cheese', 'butter', 'pickles'], steps: ['Butter the outside of the bread.', 'Fill generously with cheese and extras.', 'Toast low and slow until it oozes.'], price: '$49 (napkin included)', note: 'If it fits between two slices of bread, it is a sandwich. If it oozes, it is art.' },
  { specialName: 'Pasta “Clean Out the Fridge”', description: 'Al dente pasta tossed with soft-cooked vegetables, a knob of butter and a blizzard of grated cheese.', ingredients: ['pasta', 'vegetables', 'butter', 'cheese'], steps: ['Boil pasta in well-salted water.', 'Sauté chopped veg in butter.', 'Toss together with cheese and pasta water.'], price: '$66 (parmesan blizzard surcharge $8)', note: 'Pasta water is liquid gold. Do not pour it down the sink, you monster.' },
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

const pick = (arr, seed) => arr[seed % arr.length];

export function demoResult(mode, features, sampleId, roll = 0) {
  const seed = (features?.seed ?? Math.floor(Math.random() * 1e9)) + roll * 7919;
  const sample = sampleId && SAMPLE[sampleId];
  if (mode === 'menu') {
    if (sample?.menu.length) return { ...pick(sample.menu, seed) };
    const pool = MENU_BY_TONE[features?.tone] || MENU_BY_TONE[TONE_FALLBACK];
    return { ...pick(pool, seed) };
  }
  if (mode === 'roast') {
    if (sample?.roast.length && roll === 0) return { ...sample.roast[0] };
    // Brighter, more colourful photos lean towards kinder scores.
    const lean = Math.round(((features?.saturation ?? 0.3) + (features?.brightness ?? 0.5)) * 4);
    const sorted = [...ROASTS].sort((a, b) => a.score - b.score);
    const idx = (lean + (seed % 4) + roll) % sorted.length;
    return { ...sorted[idx] };
  }
  if (mode === 'fridge') {
    if (sample?.fridge.length) return { ...pick(sample.fridge, seed) };
    return { ...pick(FRIDGE_GENERIC, seed) };
  }
  throw new Error('Unknown mode ' + mode);
}

export const SAMPLES = [
  { id: 'noodles', src: 'samples/noodles.jpg', label: 'Instant noodles' },
  { id: 'beans', src: 'samples/beans.jpg', label: 'Beans on toast' },
  { id: 'pie', src: 'samples/pie.jpg', label: 'Meat pie with sauce' },
  { id: 'fridge', src: 'samples/fridge.jpg', label: 'Fridge contents' },
];
