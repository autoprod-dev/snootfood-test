// DEMO MODE: canned, hand-written results. No AI, no network.
// Picked from simple image features (average color / brightness) plus a seed,
// so the same photo gives a stable result until you tap “Another one!”.
// Demo results never look at what's actually in the photo. The UI says so with a banner.

const SAMPLE = {
  noodles: {
    menu: [
      { dishName: 'Instant Noodles, Lovingly Timed to Exactly 3 Minutes', description: 'Freed from their foil packet and lounging in a golden mystery broth, topped with a jammy egg and a confetti toss of green onion.', chefNotes: 'The flavor packet was opened in one bold rip. We don’t talk about the second packet.', price: '$189', pairing: 'Tap water with a slightly judgy lemon slice', spotted: ['instant noodles', 'egg', 'green onion'] },
      { dishName: 'Tuesday Night Ramen Energy', description: 'Peak convenience, zero regrets. Wavy noodles chilling in a salty hot tub, guarded by one egg that has seen some things.', chefNotes: 'Best enjoyed standing over the sink, as tradition demands.', price: '$240 (egg is extra)', pairing: 'A lemonade that went flat on Sunday', spotted: ['noodles', 'egg', 'green onion'] },
    ],
    roast: [
      { score: 6, headline: 'That egg is carrying the whole team', roast: 'Okay, the noodles are arranged like a garden hose that lost an argument, and the broth is giving hallway carpet. But that egg? It’s sitting there like a tiny sunrise, trying its absolute best.', compliment: 'The green onion sprinkle has real commitment.', fix: 'Twirl the noodles into a nest and park the egg on top.' },
    ],
    fridge: [],
  },
  beans: {
    menu: [
      { dishName: 'Beans on Toast, But Make It Brunch', description: 'Saucy baked beans tumbling over two slices of toast, browned to a very confident golden.', chefNotes: 'The toast rested for nine whole seconds, then got buttered with purpose. The beans were warmed in what we call “the little pot.”', price: '$96 a slice', pairing: 'A strong cup of tea, milk first (fight us)', spotted: ['baked beans', 'toast'] },
      { dishName: 'The Great Bean Avalanche', description: 'A landslide of baked beans sliding off sourdough cliffs onto a wide-open plate. Rustic. Fearless. Slightly runny.', chefNotes: 'The overlapping toast is two best friends who will never be apart, mostly because of the sauce.', price: '$312 (sides not included)', pairing: 'Fresh OJ, pulp is your call', spotted: ['baked beans', 'toast'] },
    ],
    roast: [
      { score: 4, headline: 'Someone call a lifeguard for this toast', roast: 'The beans have staged a full takeover. I can’t even see the toast anymore, just a puddle of orange ambition. This isn’t breakfast, it’s a tiny mudslide.', compliment: 'The toast color is honestly perfect.', fix: 'Spoon the beans onto one slice and keep the other crispy on the side.' },
    ],
    fridge: [],
  },
  pie: {
    menu: [
      { dishName: 'Meat Pie with a Ketchup Lightning Bolt', description: 'A golden pastry fortress guarding a rich beef filling, finished with one dramatic lightning bolt of ketchup.', chefNotes: 'The sauce went on in one fearless swoop. Our pastry chef cried. Our sauce guy did a victory lap.', price: '$420 (halftime special)', pairing: 'A paper bag, crumpled to room temperature', spotted: ['meat pie', 'ketchup'] },
    ],
    roast: [
      { score: 7, headline: 'Is that ketchup or a heart monitor?', roast: 'That ketchup zigzag looks like your pie is having a very exciting checkup. But the pastry is golden, the crimp is proud, and honestly, I respect a pie that doesn’t even need a plate.', compliment: 'That crust has a better tan than my sous-chef.', fix: 'Put the ketchup in a neat dot on the side and let that pastry shine.' },
    ],
    fridge: [],
  },
  fridge: {
    menu: [
      { dishName: 'Still Life: Inside the Fridge', description: 'A bold art installation. Milk, eggs, a wedge of cheese and a crisper drawer full of quiet optimism, all served perfectly chilled.', chefNotes: 'The jar in the back has been there since forever. It stays. It’s part of the art.', price: '$1,850 (electric bill included)', pairing: 'That cool breeze when the door stays open too long', spotted: ['milk', 'eggs', 'cheese', 'tomatoes', 'carrots', 'lettuce', 'bell pepper'] },
    ],
    roast: [
      { score: 5, headline: 'The crisper drawer is doing all the work', roast: 'The top shelf looks like a party where nobody knows each other. The cheese is alone in a corner, and the jam jar is gossiping with the leftovers. But those veggies? Fresh, bright, full of hope.', compliment: 'Those tomatoes are straight-up gorgeous.', fix: 'Group like with like: dairy up top, leftovers front and center.' },
    ],
    fridge: [
      { specialName: 'Fridge Raid Omelet with Crunchy Garden Slaw', description: 'A fluffy omelet folded around melty cheese and blistered tomato, with a crisp carrot and lettuce slaw tossed in lemon.', ingredients: ['eggs', 'cheese', 'tomatoes', 'lettuce', 'carrots', 'lemon', 'butter'], steps: ['Whisk three eggs with salt and pepper.', 'Cook in butter, add cheese and tomato, then fold.', 'Toss grated carrot and lettuce with lemon juice.'], price: '$64 (tonight only)', note: 'The bell pepper asked to be included. We said next time. It took it well.' },
      { specialName: 'Last Week’s Big Plans Shakshuka', description: 'Eggs gently poached in a cozy tomato and bell pepper sauce, finished with crumbled cheese and buttery toast strips for dunking.', ingredients: ['eggs', 'tomatoes', 'bell pepper', 'cheese', 'butter'], steps: ['Soften chopped bell pepper and tomato in oil.', 'Make little wells, crack in the eggs, then cover.', 'Cook until set and crumble cheese on top.'], price: '$78 (bread basket $14)', note: 'Got leftovers in a container? Serve them as a mystery side. Live a little.' },
    ],
  },
};

const MENU_BY_TONE = {
  warm: [
    { dishName: 'Big Red Sauce Energy', description: 'A bold, red-hot situation featuring sun-ripened tomatoes and at least one moment of panic near the stove.', chefNotes: 'Plated to the sound of the smoke alarm, which our kitchen counts as applause.', price: '$275', pairing: 'Sparkling water with a defiant lime wedge', spotted: [] },
    { dishName: 'The Main Character Plate', description: 'Bold, red, unapologetic. Every single thing on this plate thinks it’s the star, and honestly? Valid.', chefNotes: 'Garnish was considered, rejected, then reconsidered. You’re looking at the compromise.', price: '$318 (sharing is frowned upon)', pairing: 'Ice-cold raspberry soda, extra fizz', spotted: [] },
  ],
  golden: [
    { dishName: 'House Special Golden Crunch', description: 'Bronzed to the exact shade of a beach day, this golden beauty crackles with the confidence of food that knows it’s crunchy.', chefNotes: 'Our fry cook has a certificate in “vibes.” It’s laminated.', price: '$199', pairing: 'Iced tea, stirred clockwise only', spotted: [] },
    { dishName: 'Golden Hour on a Plate', description: 'Caramelized, glistening and lit like an influencer at sunset. Served at the exact temperature of “careful, it’s hot.”', chefNotes: 'If it’s beige, it’s delicious. That’s house rule number one.', price: '$249 (fork rental extra)', pairing: 'A fizzy ginger beer with notes of nostalgia', spotted: [] },
  ],
  green: [
    { dishName: 'Secret Garden Herb Situation', description: 'A leafy landscape of greens and good intentions, foraged from the nearest grocery store with tremendous bravery.', chefNotes: 'Every leaf was personally told it was doing a great job.', price: '$165 (dressing on request, sigh)', pairing: 'Cucumber water, served with a smug smile', spotted: [] },
    { dishName: 'The Monday Fresh-Start Salad', description: 'Crisp, green and full of hope. This salad is a fresh start, a new you, and the brief moment before ordering fries anyway.', chefNotes: 'Best eaten slowly while thinking about dessert.', price: '$140 (dessert sold separately, obviously)', pairing: 'A kombucha that’s a little too pleased with itself', spotted: [] },
  ],
  earthy: [
    { dishName: 'Mystery Stew Deluxe', description: 'A deep, cozy, brown-on-brown masterpiece. Rich in flavor, rich in history, and the exact color of a well-loved leather couch.', chefNotes: 'Brown food is the little black dress of cooking. It goes with everything.', price: '$288 (bread for mopping: priceless)', pairing: 'Hot chocolate with one heroic marshmallow', spotted: [] },
    { dishName: 'Slow-Cooked Deep Thoughts', description: 'Cooked low and slow until every ingredient forgot its original shape and became one big, cozy puddle of joy.', chefNotes: 'Simmered for hours, or possibly microwaved for four minutes. We’d rather not say.', price: '$356', pairing: 'Black tea, steeped until a spoon could stand up in it', spotted: [] },
  ],
  pale: [
    { dishName: 'White on White, Extremely Minimalist', description: 'A bold monochrome moment. Pale, subtle and so understated you might mistake it for the plate.', chefNotes: 'Color is a distraction. Our chef hasn’t touched paprika since 2019.', price: '$410 (for the concept alone)', pairing: 'A glass of milk, served very seriously', spotted: [] },
    { dishName: 'Cloud of Carb Dreams', description: 'Soft, fluffy, beige and beautiful. Basically a hug you can eat after a long week.', chefNotes: 'No vegetables were harmed in the making of this dish. None were invited.', price: '$222', pairing: 'Vanilla oat latte, extra foam, extra drama', spotted: [] },
  ],
  dark: [
    { dishName: 'Midnight Mystery Plate', description: 'Dramatic, moody and lit like a detective movie. What is it? Where does it end? Only the chef knows, and the chef already went home.', chefNotes: 'We plate by candlelight for the ambiance. Also, the bulb blew.', price: '$499 (flashlight rental $20)', pairing: 'Espresso, served with an air of mystery', spotted: [] },
  ],
};

const ROASTS = [
  { score: 3, headline: 'I’ve seen tidier junk drawers', roast: 'Wow. This plate looks like the food fell from a great height and just accepted its fate. No structure, no plan, only chaos and a faint sense of regret.', compliment: 'It does look like it’d taste great, which is annoying.', fix: 'Pick one hero item and build everything around it.' },
  { score: 5, headline: 'Perfectly average, like a beige cardigan', roast: 'It’s fine. It’s food. It’s sitting on the plate like it’s waiting for a bus. Nobody’s writing poems about it, but nobody’s filing a complaint either.', compliment: 'Generous portion. Big heart energy.', fix: 'Add something green on top. Anything. A leaf. Please.' },
  { score: 8, headline: 'Ugh. Fine. This is actually good.', roast: 'I showed up ready to roast and you handed me… competence. The colors work, the layout has a plan, and I’m furious about it. Don’t let this go to your head.', compliment: 'Legit restaurant-worthy. It physically hurts to say that.', fix: 'Wipe the rim of the plate and it’s a nine.' },
  { score: 2, headline: 'This plate needs a lawyer', roast: 'What did this plate ever do to you? Everything is piled in the middle like a game of food Jenga that’s already lost. Even the fork looks nervous.', compliment: 'Bold. Fearless. Wrong, but fearless.', fix: 'Spread it out and give each food some personal space.' },
  { score: 6, headline: 'So close, but the sauce went rogue', roast: 'There’s a great idea in here, hiding behind a sauce that clearly broke out of jail. It’s smeared like it was trying to sign its own name. Almost there, chef.', compliment: 'The main event is cooked with real care.', fix: 'Sauce goes under the food, not across the plate like graffiti.' },
  { score: 4, headline: 'Big summer camp cafeteria energy', roast: 'This has the vibe of food served on a tray at 7 a.m. by the same person who runs canoe lessons. Nutritious? Maybe. Gorgeous? We’re not discussing that today.', compliment: 'Comforting, honest and clearly made with love.', fix: 'Use a smaller plate so it looks abundant, not lonely.' },
  { score: 7, headline: 'Respectable. I’m almost not grumpy.', roast: 'The colors are cheerful and the portions are tidy. My mustache twitched with something close to approval. Don’t tell the kitchen crew. They’ll expect compliments now.', compliment: 'Lovely color balance. Very snackable.', fix: 'A sprinkle of fresh herbs would level this right up.' },
  { score: 1, headline: 'Is this dinner or modern art?', roast: 'I’ve stared at this for a long time and I still can’t tell which way is up. It might be dinner. It might be a statement. Either way, my chef hat just wilted.', compliment: 'I admire the confidence it took to photograph this.', fix: 'Start over, but slower, and with a plan.' },
];

const FRIDGE_GENERIC = [
  { specialName: 'Leftover Treasure Frittata', description: 'Whatever was hiding in the crisper, folded into golden eggs and finished under a hot broiler until puffy and proud.', ingredients: ['eggs', 'leftover veggies', 'cheese'], steps: ['Chop any veggies that still look perky.', 'Pour beaten eggs over the veggies in a hot pan.', 'Top with cheese and broil until golden.'], price: '$72 (market price, and the market is your fridge)', note: 'Demo mode can’t actually see your fridge, so here’s our house favorite.' },
  { specialName: 'Next-Day Fried Rice', description: 'Day-old rice reborn in a screaming-hot pan with a rainbow of chopped veggies, a splash of soy and a fried egg on top for drama.', ingredients: ['rice', 'veggies', 'eggs', 'soy sauce'], steps: ['Heat the oil until it shimmers.', 'Fry the veggies, then the rice, then add soy.', 'Top it off with a fried egg.'], price: '$58', note: 'The best fried rice uses yesterday’s rice and today’s confidence.' },
  { specialName: 'Supreme Melty Grilled Cheese', description: 'A gooey grilled cheese upgraded with whatever spreads, slices and pickles your fridge door has been hoarding.', ingredients: ['bread', 'cheese', 'butter', 'pickles'], steps: ['Butter the outside of the bread.', 'Load it up with cheese and extras.', 'Toast low and slow until it oozes.'], price: '$49 (napkin included)', note: 'If it fits between two slices of bread, it’s a sandwich. If it oozes, it’s art.' },
  { specialName: 'Clean-Out-the-Fridge Pasta', description: 'Al dente pasta tossed with tender veggies, a pat of butter and a blizzard of grated cheese.', ingredients: ['pasta', 'veggies', 'butter', 'cheese'], steps: ['Boil pasta in well-salted water.', 'Sauté chopped veggies in butter.', 'Toss it all with cheese and a splash of pasta water.'], price: '$66 (parmesan blizzard surcharge $8)', note: 'Pasta water is liquid gold. Don’t you dare pour it down the sink.' },
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
    // Brighter, more colorful photos lean towards kinder scores.
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
  { id: 'pie', src: 'samples/pie.jpg', label: 'Meat pie with ketchup' },
  { id: 'fridge', src: 'samples/fridge.jpg', label: 'Fridge haul' },
];
