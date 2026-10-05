import { APP } from './config.js';
import { analyseImage, demoResult, SAMPLES } from './demo.js';
import { PROVIDERS, RELAY_MODEL, analyse, AIError } from './ai.js';
import { renderCard, canvasToBlob, prepareCardAssets } from './card.js';
import { decodeImage, resizeTo, toJpeg, photoCheck, FRIDGE_EDGE, FRIDGE_QUALITY } from './image.js';
import { daily, bumpStreak, markShared } from './daily.js';
import { maybeNudgeInstall, inAppHint } from './install.js';
import { budget, spend, kitchenClosed, closeKitchen, nextResetLocal, ageOk, setAge } from './budget.js';

const $ = (s) => document.querySelector(s);
const chefAlt = (mode) => `${APP.chef}, looking ${APP.chefArt[mode].mood}`;
function chefPicture(mode, cls) {
  const a = APP.chefArt[mode];
  const pic = document.createElement('picture'); pic.className = cls;
  const src = document.createElement('source'); src.type = 'image/webp'; src.srcset = a.file + '.webp';
  const img = document.createElement('img'); img.src = a.file + '.png'; img.alt = chefAlt(mode); img.width = a.w; img.height = a.h; img.decoding = 'async';
  pic.append(src, img);
  return pic;
}
function chefSign(mode) {
  const s = el('div', 'chef-sign'); s.append(el('p', 'byline', '— ' + APP.chef), chefPicture(mode, 'sign-chef'));
  return s;
}
const STORE = 'snootfood.settings.v1';

const COPY = {
  menu: {
    intro: 'Hey there! Show me your dinner, even if it’s instant noodles. <em>Especially</em> if it’s instant noodles. I’ll make it sound like it costs a fortune.',
    snap: 'Snap your meal', eyebrow: 'On the menu tonight',
    loading: ['Warming up the plates…', 'Ironing the tablecloth…', 'Asking the drinks guy (he only does soda)…', 'Making the name sound way fancier…', 'Calculating a totally unreasonable price…'],
  },
  roast: {
    intro: `I’m ${APP.chef}. I’ve judged ten thousand plates and loved maybe four. Show me yours. I’ll be honest. Like, <em>really</em> honest.`,
    snap: 'Snap your plating', eyebrow: 'Chef Roast',
    loading: ['Chef is squinting…', 'Chef just put on his reading glasses…', 'The mustache is twitching…', 'Sharpening the scorecard…', 'Sighing very dramatically…'],
  },
  fridge: {
    intro: 'Open the fridge, snap what’s inside, and I’ll whip up tonight’s special. Nobody needs to know about that jar in the back.',
    snap: 'Snap your fridge', eyebrow: 'Tonight’s Special',
    loading: ['Digging through the crisper…', 'Sniffing the milk, bravely…', 'Writing on the chalkboard…', 'Ignoring the mystery container…', 'Coming up with a catchy name…'],
    scanLoading: ['Scanning every shelf…', 'Squinting at the back row…', 'Counting the eggs…', 'Checking out the door shelves…', 'Making a list, checking it twice…'],
    recipeLoading: ['Cooking up ideas…', 'Sticking to your list, promise…', 'Writing on the chalkboard…', 'Coming up with a catchy name…'],
  },
};

const DEMO_BANNER = {
  fridge: 'These are sample ingredients, not what’s in your fridge. Real photo reading kicks in once the AI key is hooked up.',
  other: 'This is a sample take, not a read of your photo. Real photo reading kicks in once the AI key is hooked up.',
};

const QUALITY_WARNING = {
  blurry: 'This one’s a little blurry, so I might have missed stuff. Retake it, or fix the list below.',
  dark: 'It’s pretty dark in there! Double-check the list, or retake it with the light on.',
  too_far: 'That’s a bit far away. Get closer for a better read, or fix the list below.',
  no_food: 'I couldn’t spot any food in this one. Try a closer, brighter shot, or type what you’ve got below.',
};

const state = { mode: 'menu', photo: null, apiDataUrl: null, fridgeDataUrl: null, features: null, sampleId: null, result: null, roll: 0, ctrl: null, card: null, cardKey: '', source: 'demo', fridge: null };

// ───────── Settings ─────────
function loadSettings() {
  try { return { provider: 'gemini', keys: {}, models: {}, forceDemo: false, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; }
  catch { return { provider: 'gemini', keys: {}, models: {}, forceDemo: false }; }
}
let settings = loadSettings();
const saveSettings = () => localStorage.setItem(STORE, JSON.stringify(settings));
const activeKey = () => (settings.keys[settings.provider] || '').trim();
// A key pasted by the user wins; otherwise use the relay if one is configured; otherwise demo.
const aiProvider = () => (settings.forceDemo ? null : activeKey() ? settings.provider : APP.relayUrl ? 'relay' : null);
const usingAI = () => !!aiProvider();
const aiArgs = () => {
  const provider = aiProvider();
  return provider === 'relay' ? { provider, key: '', model: RELAY_MODEL } : { provider, key: activeKey(), model: settings.models[settings.provider] };
};

// The per-device daily budget and the kitchen-closed state only apply to the shared relay; your own key is your own quota.
const budgeted = () => aiProvider() === 'relay';
const callCost = (mode) => (mode === 'fridge' ? (state.fridge ? 1 : 2) : 1);   // fridge = scan + recipe
function noAIReason(cost) {
  if (!usingAI()) return 'off';
  if (state.sampleId) return 'sample';
  if (!budgeted()) return '';
  if (kitchenClosed()) return 'closed';
  if (budget().used + cost > APP.realCallsPerDay) return 'budget';
  return '';
}
const wantsAI = (cost) => noAIReason(cost) === '';
const spendOne = () => { if (budgeted()) spend(1); };

function refreshDemoPill() { $('#demoPill').hidden = usingAI(); refreshKitchen(); }
function refreshKitchen() {
  const closed = budgeted() && kitchenClosed();
  const b = $('#kitchenBanner');
  b.hidden = !closed;
  if (closed) b.textContent = `Chef’s off duty till ${nextResetLocal()}. Everything’s a demo take until then.`;
}

// 18+ check, once, right before the first real AI call. "No" switches this device to demo mode.
function confirmAge() {
  if (!APP.ageGate || ageOk()) return Promise.resolve(true);
  const d = $('#ageGate');
  const p = aiProvider();
  $('#ageProvider').textContent = p === 'relay' || p === 'gemini' ? 'Google Gemini' : (PROVIDERS[p]?.label || 'an AI service').split(' · ')[0];
  return new Promise((resolve) => {
    d.addEventListener('close', () => {
      const yes = d.returnValue === 'yes';
      if (yes) setAge(true);
      else if (d.returnValue === 'no') { setAge(false); settings.forceDemo = true; saveSettings(); refreshDemoPill(); toast('No problem! Demo mode is on. You can change it in Settings.'); }
      resolve(yes);
    }, { once: true });
    d.returnValue = '';
    d.showModal();
  });
}

function setNote(text, cls = '') {
  const n = $('#runNote');
  n.replaceChildren(); n.className = 'run-note ' + cls; n.hidden = !text;
  if (text) n.append(text);
  return n;
}

function fillSettingsForm() {
  const sel = $('#provider');
  sel.innerHTML = '';
  for (const [id, p] of Object.entries(PROVIDERS)) sel.add(new Option(p.label, id, false, id === settings.provider));
  syncProviderFields();
  $('#forceDemo').checked = !!settings.forceDemo;
}
function syncProviderFields() {
  const id = $('#provider').value, p = PROVIDERS[id];
  $('#apiKey').value = settings.keys[id] || '';
  $('#model').value = settings.models[id] || p.defaultModel;
  $('#model').placeholder = p.defaultModel;
  $('#keyHint').textContent = p.keyHint;
  const link = $('#keyLink');
  link.href = p.keyUrl;
  link.textContent = id === 'gemini' || id === 'openrouter' ? 'Get a free key' : 'Get a key';
}

function openSettings() { fillSettingsForm(); $('#settings').showModal(); }

// ───────── Images ─────────
async function usePhoto(fileOrUrl, sampleId = null) {
  let img;
  try { img = await decodeImage(fileOrUrl); }
  catch { toast('Hmm, that image won’t open. Try a JPEG or PNG (or just screenshot it).'); return; }
  state.photo = resizeTo(img, FRIDGE_EDGE);     // upright, long edge ≤1600 px: preview, share card, Fridge Chef AI copy
  state.apiDataUrl = resizeTo(state.photo, 1024).toDataURL('image/jpeg', 0.8);   // Fancy Menu / Chef Roast AI copy
  state.fridgeDataUrl = null;                   // made on demand (1600 px, JPEG 0.85, ≤2 MB)
  img.close?.();
  state.features = analyseImage(state.photo);
  state.sampleId = sampleId;
  state.roll = 0;
  state.fridge = null;
  $('#photo').src = state.photo.toDataURL('image/jpeg', 0.85);
  $('#photo').alt = sampleId ? `Sample photo: ${SAMPLES.find((s) => s.id === sampleId).label}` : 'Your photo';
  $('#intro').hidden = true;
  $('#teaser').hidden = true;
  $('#result').hidden = false;
  run();
}
const fridgeDataUrl = () => (state.fridgeDataUrl ||= toJpeg(state.photo, FRIDGE_QUALITY).dataUrl);

// ───────── Run a mode ─────────
let loadingTimer;
function setBusy(on, lines = COPY[state.mode].loading) {
  const res = $('#result');
  res.setAttribute('aria-busy', String(on));
  $('#loading').hidden = !on;
  clearInterval(loadingTimer);
  if (on) {
    let i = Math.floor(Math.random() * lines.length);
    $('#loading').textContent = lines[i];
    loadingTimer = setInterval(() => { i = (i + 1) % lines.length; $('#loading').textContent = lines[i]; }, 1100);
  }
}

function hideOutputs() { $('#panel').hidden = true; $('#actions').hidden = true; $('#error').hidden = true; }

async function run({ force = false, demoOnly = false, attempt = 0 } = {}) {
  state.ctrl?.abort();
  clearInterval(retryTimer);
  const ctrl = (state.ctrl = new AbortController());
  const mode = state.mode;
  hideOutputs();
  if (!attempt) setNote('');
  // Decide once, up front, whether this run may spend a real AI call (samples, tab switches and an empty budget never do).
  const cost = callCost(mode);
  const why = noAIReason(cost);
  let ai = (force || !demoOnly) && why === '';
  const needsCall = ai && !(mode === 'fridge' && state.fridge && !state.fridge.confirmed);
  if (needsCall && !(await confirmAge())) ai = false;
  if (ctrl.signal.aborted) return;
  if (!ai && !demoOnly && why === 'budget') setNote(`You’ve used today’s real reads. Here’s Chef’s demo take. Fresh reads at ${nextResetLocal()}.`, 'budget');
  if (!ai && !demoOnly && why === 'closed') refreshKitchen();

  // Fridge Chef with real AI: step 1 = read the photo into a checklist, step 2 = recipe from the confirmed list.
  if (mode === 'fridge' && ai && (!state.fridge || !state.fridge.confirmed)) {
    if (state.fridge) { showChecklist(); return; }
    const check = photoCheck(state.photo);
    if (check.blank) { showError(check.dark ? 'That photo’s basically pitch black. Try again with the fridge light on!' : 'That photo looks blank to me. Try a closer shot of your fridge shelves.', mode, true); return; }
    setBusy(true, COPY.fridge.scanLoading);
    try {
      const scan = await analyse({ ...aiArgs(), task: 'fridgeScan', dataUrl: fridgeDataUrl(), signal: ctrl.signal });
      spendOne();
      if (ctrl.signal.aborted || mode !== state.mode) return;
      setBusy(false);
      state.fridge = makeChecklist(scan);
      showChecklist();
    } catch (e) {
      if (e.name === 'AbortError' || ctrl.signal.aborted) return;
      setBusy(false);
      aiFailed(e, mode, true, attempt);
    }
    return;
  }
  setBusy(true, mode === 'fridge' && ai ? COPY.fridge.recipeLoading : COPY[mode].loading);
  let result, source;
  try {
    if (ai) {
      if (mode === 'fridge') {
        const ingredients = state.fridge.items.filter((i) => i.checked && i.name.trim()).map(({ name, quantity }) => ({ name: name.trim(), quantity: quantity.trim() }));
        result = await analyse({ ...aiArgs(), task: 'fridgeRecipe', input: { ingredients, roll: state.roll }, signal: ctrl.signal });
      } else {
        result = await analyse({ ...aiArgs(), task: mode, dataUrl: state.apiDataUrl, signal: ctrl.signal });
      }
      spendOne();
      source = 'ai';
    } else {
      await new Promise((r) => setTimeout(r, state.sampleId || demoOnly ? 250 : 650 + Math.random() * 500));
      result = demoResult(mode, state.features, state.sampleId, state.roll);
      source = 'demo';
    }
  } catch (e) {
    if (e.name === 'AbortError' || ctrl.signal.aborted) return;
    setBusy(false);
    aiFailed(e, mode, false, attempt);
    return;
  }
  if (ctrl.signal.aborted || mode !== state.mode) return;
  setBusy(false);
  state.result = result; state.source = source;
  showResult();
  if (demoOnly) offerRealTake(mode);
}

// After a tab switch we show a free demo take, plus a button to spend a real read on it.
function offerRealTake(mode) {
  const cost = callCost(mode);
  if (!wantsAI(cost)) return;
  const n = setNote('', 'real-take'); n.hidden = false;
  const b = el('button', 'btn btn-small real-take-btn', budgeted() ? `Get Chef’s real take (uses ${cost} of today’s ${budget().left})` : 'Get Chef’s real take');
  b.type = 'button'; b.id = 'realTakeBtn';
  b.onclick = () => { setNote(''); run({ force: true }); };
  n.append(b);
}

// Quota and other AI errors. Daily cap → close the kitchen and go straight to a demo; per-minute → retry twice with a countdown.
let retryTimer;
function aiFailed(e, mode, offerManual, attempt) {
  if (e instanceof AIError && e.kind === 'rate_day') {
    closeKitchen(); refreshKitchen();
    state.result = demoResult(mode, state.features, state.sampleId, state.roll); state.source = 'demo';
    showResult();
    setNote(`Chef’s off duty till ${nextResetLocal()}. Here’s a demo take meanwhile.`, 'closed');
    return;
  }
  if (e instanceof AIError && e.kind === 'rate' && attempt < 2) {
    let left = 20;
    const tick = () => { $('#errorMsg').textContent = `Kitchen’s slammed, trying again in ${left} s… `; };
    showError('', mode, offerManual, 'Show me a demo now');
    tick();
    const ctrl = state.ctrl;
    retryTimer = setInterval(() => {
      if (ctrl !== state.ctrl || ctrl.signal.aborted) { clearInterval(retryTimer); return; }
      left -= 1;
      if (left > 0) { tick(); return; }
      clearInterval(retryTimer);
      run({ force: true, attempt: attempt + 1 });
    }, 1000);
    return;
  }
  showError(e instanceof AIError ? e.message : 'Oops, something went sideways. Give it another shot.', mode, offerManual);
}

function showError(msg, mode, offerManual, demoLabel = 'Show me a demo result instead') {
  const box = $('#error');
  box.innerHTML = '';
  const m = el('span', null, msg ? msg + ' ' : ''); m.id = 'errorMsg'; box.append(m);
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'link'; b.id = 'demoNowBtn'; b.textContent = demoLabel;
  b.onclick = () => { clearInterval(retryTimer); state.ctrl?.abort(); state.result = demoResult(mode, state.features, state.sampleId, state.roll); state.source = 'demo'; box.hidden = true; showResult(); };
  box.append(b);
  if (offerManual && mode === 'fridge') {
    const m = document.createElement('button');
    m.type = 'button'; m.className = 'link'; m.id = 'typeInsteadBtn'; m.textContent = 'Type my ingredients instead';
    m.onclick = () => { state.fridge = makeChecklist({ items: [], photoQuality: 'good', summary: '' }); state.fridge.manual = true; box.hidden = true; showChecklist(); };
    box.append(' · ', m);
  }
  box.hidden = false;
  $('#actions').hidden = false;
  $('#shareBtn').hidden = true;
  $('#editBtn').hidden = true;
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// ───────── Fridge checklist (step 1 of 2) ─────────
let itemSeq = 0;
function makeChecklist(scan) {
  return {
    confirmed: false, photoQuality: scan.photoQuality, summary: scan.summary,
    items: scan.items.map((i) => ({ id: ++itemSeq, name: i.name, quantity: i.quantity || '', confidence: i.confidence, note: i.note || '', checked: i.confidence !== 'low' })),
  };
}

const CONF_LABEL = { high: 'sure', medium: 'pretty sure', low: 'not sure?' };

function showChecklist() {
  const f = state.fridge, p = $('#panel');
  hideOutputs();
  p.className = 'panel fridge checklist';
  p.replaceChildren();
  p.append(el('p', 'eyebrow', 'Step 1 of 2 · Check the haul'));
  p.append(el('h2', null, f.manual ? 'What’ve you got?' : f.items.length ? 'Here’s what I spotted' : 'Hmm, I came up empty'));
  if (f.summary) p.append(el('p', 'desc', f.summary));
  const warn = f.manual ? '' : !f.items.length ? QUALITY_WARNING.no_food : QUALITY_WARNING[f.photoQuality] || '';
  if (warn) p.append(el('p', 'ck-warning', warn));
  p.append(el('p', 'ck-help', f.items.length ? 'Tick what’s really there, fix anything I got wrong, and add whatever I missed. “Not sure?” items start unticked.' : 'Add your ingredients one at a time below.'));

  const ul = el('ul', 'checklist'); ul.id = 'checklist';
  const count = () => f.items.filter((i) => i.checked && i.name.trim()).length;
  const cook = el('button', 'btn btn-primary btn-xl cook-btn');
  cook.type = 'button'; cook.id = 'cookBtn';
  const refreshCook = () => { const n = count(); cook.disabled = n === 0; cook.textContent = n ? `Cook up tonight’s special (${n} item${n === 1 ? '' : 's'})` : 'Tick at least one ingredient'; };

  const renderItem = (it) => {
    const li = el('li', `ck-item conf-${it.confidence}`); li.dataset.id = it.id;
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = it.checked; cb.id = `ck-${it.id}`; cb.className = 'ck-check';
    cb.setAttribute('aria-label', `Use ${it.name}`);
    cb.onchange = () => { it.checked = cb.checked; li.classList.toggle('off', !cb.checked); refreshCook(); };
    const name = el('input', 'ck-name'); name.type = 'text'; name.value = it.name; name.maxLength = 60;
    name.setAttribute('aria-label', 'Ingredient name'); name.autocomplete = 'off';
    name.oninput = () => { it.name = name.value; cb.setAttribute('aria-label', `Use ${it.name}`); refreshCook(); };
    const del = el('button', 'ck-del', '×'); del.type = 'button'; del.setAttribute('aria-label', `Remove ${it.name}`);
    del.onclick = () => { f.items = f.items.filter((x) => x !== it); li.remove(); refreshCook(); };
    const meta = el('div', 'ck-meta');
    const qty = el('input', 'ck-qty'); qty.type = 'text'; qty.value = it.quantity; qty.placeholder = 'how much?'; qty.maxLength = 30;
    qty.setAttribute('aria-label', `Amount of ${it.name}`); qty.autocomplete = 'off';
    qty.oninput = () => { it.quantity = qty.value; };
    meta.append(qty);
    if (it.confidence && !f.manual && it.confidence !== 'added') meta.append(el('span', `ck-conf ${it.confidence}`, CONF_LABEL[it.confidence] || ''));
    if (it.note) meta.append(el('span', 'ck-note', it.note));
    li.classList.toggle('off', !it.checked);
    li.append(cb, name, del, meta);
    return li;
  };
  f.items.forEach((it) => ul.append(renderItem(it)));
  p.append(ul);

  const add = el('form', 'ck-add'); add.id = 'ckAdd';
  const addInput = el('input'); addInput.type = 'text'; addInput.id = 'ckAddInput'; addInput.maxLength = 60; addInput.autocomplete = 'off';
  addInput.placeholder = f.items.length ? 'Add something I missed' : 'Add an ingredient (like eggs)';
  addInput.setAttribute('aria-label', 'Add an ingredient');
  const addBtn = el('button', 'btn btn-small', 'Add'); addBtn.type = 'submit';
  add.append(addInput, addBtn);
  add.onsubmit = (e) => {
    e.preventDefault();
    const v = addInput.value.trim();
    if (!v) return;
    if (f.items.length >= 30) { toast('That’s plenty! 30 items max.'); return; }
    const it = { id: ++itemSeq, name: v.slice(0, 60), quantity: '', confidence: 'added', note: '', checked: true };
    f.items.push(it); ul.append(renderItem(it)); addInput.value = ''; refreshCook(); addInput.focus();
  };
  p.append(add);

  cook.onclick = () => { f.items = f.items.filter((i) => i.name.trim()); f.confirmed = true; state.roll = 0; run(); };
  refreshCook();
  p.append(cook, el('p', 'safety', 'Only ticked items go into the recipe (plus basics like oil, salt and pepper).'));
  const retake = el('button', 'btn btn-ghost ck-retake', 'Retake photo'); retake.type = 'button';
  retake.onclick = () => $('#newBtn').click();
  p.append(retake);
  p.hidden = false;
}

// ───────── Results ─────────
let resultsThisSession = 0;
function showResult() {
  const r = state.result, p = $('#panel');
  const st = bumpStreak();
  if (++resultsThisSession === 2) setTimeout(() => maybeNudgeInstall('second-result'), 1200);
  refreshDaily(st.milestone);
  if (st.milestone) toast(`${st.count} days straight! ${APP.chef} is… mildly impressed.`);
  p.className = 'panel ' + state.mode;
  p.replaceChildren();
  if (state.source === 'demo') {
    const banner = el('div', 'demo-banner'); banner.setAttribute('role', 'note');
    banner.append(el('strong', null, 'Heads up: demo result! '), DEMO_BANNER[state.mode === 'fridge' ? 'fridge' : 'other']);
    p.append(banner);
  }
  const eyebrow = el('p', 'eyebrow', state.mode === 'fridge' && state.source === 'ai' ? 'Step 2 of 2 · Tonight’s Special' : COPY[state.mode].eyebrow);
  if (state.source === 'demo') eyebrow.append(el('span', 'demo-tag', 'DEMO'));
  p.append(eyebrow);
  if (state.mode === 'menu') {
    p.append(el('h2', null, r.dishName), el('p', 'desc', r.description));
    const pr = el('div', 'price-row'); pr.append(el('span', 'price', r.price)); p.append(pr);
    const n = el('p', 'notes'); n.append(el('b', null, 'CHEF’S NOTES'), '“' + r.chefNotes + '”'); p.append(n);
    p.append(el('p', 'pairing', 'Pair it with: ' + r.pairing));
    if (r.spotted?.length) { const ul = el('ul', 'chips'); ul.setAttribute('aria-label', 'Spotted on your plate'); r.spotted.forEach((s) => ul.append(el('li', null, s))); p.append(ul); }
    p.append(chefSign('menu'));
  } else if (state.mode === 'roast') {
    const top = el('div', 'roast-top');
    const sc = el('div', 'score'); sc.setAttribute('role', 'img'); sc.setAttribute('aria-label', `Score: ${r.score} out of 10`);
    sc.innerHTML = `<span aria-hidden="true">${r.score}<small>/10</small></span>`;
    top.append(sc, el('h2', null, r.headline)); p.append(top);
    const vs = challengeVs();
    if (vs) p.append(el('p', 'challenge-line ' + (vs.mine > vs.theirs ? 'won' : vs.mine < vs.theirs ? 'lost' : 'tie'), challengeLine(vs)));
    p.append(el('p', 'roast-quote', r.roast), el('p', 'good', '✓ ' + r.compliment), el('p', 'tip', 'Pro tip: ' + r.fix), chefSign('roast'));
  } else {
    p.append(el('h2', null, r.specialName), el('p', 'desc', r.description), el('p', 'ingr', 'Made with: ' + r.ingredients.join(' · ')));
    const ol = el('ol'); r.steps.forEach((s) => ol.append(el('li', null, s))); p.append(ol);
    const row = el('p'); row.append(el('span', 'fprice', r.price)); p.append(row);
    p.append(el('p', 'fnote', '“' + r.note + '”'), chefSign('fridge'), el('p', 'safety', 'Quick reminder: check expiration dates and allergies before you cook. This is for fun, not a guaranteed recipe.'));
  }
  if (r.isFood === false) p.prepend(el('p', 'error', 'Hmm, Chef’s not totally sure that’s food, but he rolled with it anyway.'));
  p.hidden = false;
  if (state.challenge?.mode === state.mode) $('#challengeBanner').hidden = true;
  $('#actions').hidden = false;
  $('#shareBtn').hidden = false;
  $('#editBtn').hidden = !(state.mode === 'fridge' && state.source === 'ai' && state.fridge);
  $('#againBtn').textContent = state.source === 'demo' ? 'Another one!' : 'Ask again';
  $('#shareNote').textContent = '';
  prerenderCard();
}

// ───────── Share card ─────────
const cardSize = () => document.querySelector('input[name=cardSize]:checked').value;
async function prerenderCard() {
  const d = daily();
  const opts = { story: cardSize() === 'story', challenge: challengeVs(), demo: state.source === 'demo' && !state.sampleId, daily: { n: d.n, theme: d.theme, streak: d.streak } };
  const key = JSON.stringify([state.mode, state.result, opts]);
  if (state.cardKey === key && state.card) return state.card;
  state.cardKey = key; state.card = null;
  const canvas = await renderCard(state.mode, state.result, state.photo, opts);
  const blob = await canvasToBlob(canvas);
  if (state.cardKey !== key) return null;
  const name = `${APP.name.toLowerCase()}-${state.mode}-${Date.now().toString(36)}.png`;
  state.card = new File([blob], name, { type: 'image/png' });
  syncShareLabel(state.card);
  return state.card;
}

// ───────── Share (QW2) ─────────
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MODE_TAG = { roast: '#RateMyPlate', menu: '#FancyMenu', fridge: '#FridgeChef' };

// ───────── Challenge link (QW3) ─────────
const priceDigits = (price) => { const m = String(price || '').match(/\d[\d,]*/); const d = m ? m[0].replace(/,/g, '') : ''; return /^\d{1,6}$/.test(d) ? d : ''; };
function challengeUrl() {
  const r = state.result;
  if (!r) return APP.url;
  let q = '?challenge=' + state.mode;
  if (state.mode === 'roast') q += '&s=' + Math.max(0, Math.min(10, Math.round(Number(r.score) || 0)));
  if (state.mode === 'menu' && priceDigits(r.price)) q += '&p=' + priceDigits(r.price);
  return APP.url + q;
}
// Values come from the URL: allow-list the mode, clamp the numbers, and only ever render them with textContent.
function readChallenge() {
  const q = new URLSearchParams(location.search);
  const mode = q.get('challenge');
  if (!['roast', 'menu', 'fridge'].includes(mode)) return null;
  const c = { mode, s: null, p: null };
  if (mode === 'roast' && /^\d{1,2}$/.test(q.get('s') || '')) c.s = Math.min(10, Number(q.get('s')));
  if (mode === 'menu' && /^\d{1,6}$/.test(q.get('p') || '')) c.p = q.get('p');
  return c;
}
function showChallengeBanner(c) {
  const b = $('#challengeBanner'); b.replaceChildren();
  const p = document.createElement('p');
  const strong = (t) => el('strong', null, t);
  if (c.mode === 'roast' && c.s != null) p.append('Your friend scored ', strong(`${c.s}/10`), ` with ${APP.chef}. Snap your plate and see if you can beat it.`);
  else if (c.mode === 'roast') p.append(`Your friend got roasted by ${APP.chef}. Snap your plate and see how yours does.`);
  else if (c.mode === 'menu' && c.p) p.append('Your friend’s dinner was priced at ', strong('$' + Number(c.p).toLocaleString('en-US')), '. Can yours get fancier?');
  else if (c.mode === 'menu') p.append('Your friend’s dinner got the fancy menu treatment. Can yours get fancier?');
  else p.append('Your friend’s fridge made tonight’s special. Raid yours.');
  b.append(el('span', 'challenge-tag', 'Challenge'), p);
  b.hidden = false;
}
function challengeVs() {   // roast only: { mine, theirs } when this result answers a friend's score
  const c = state.challenge;
  if (!c || c.mode !== 'roast' || c.s == null || state.mode !== 'roast' || !state.result) return null;
  return { mine: Number(state.result.score), theirs: c.s };
}
function challengeLine(vs) {
  if (vs.mine > vs.theirs) return `You beat your friend: ${vs.mine} vs ${vs.theirs} 🏆`;
  if (vs.mine < vs.theirs) return `Your friend wins this round: ${vs.theirs} vs ${vs.mine}`;
  return `Dead even with your friend: ${vs.mine} vs ${vs.theirs}`;
}
function challengeShare() {
  const r = state.result; if (!r) return;
  const line = state.mode === 'roast' ? `${APP.chef} gave my plate a ${r.score}/10. Think your plate can beat a ${r.score}/10?`
    : state.mode === 'menu' ? `${APP.chef} priced my dinner at ${r.price}. Can yours get fancier?`
    : `My fridge just made tonight’s special with ${APP.chef}. Raid yours:`;
  const url = challengeUrl(), note = $('#shareNote');
  const fallback = () => copyCaption(`${line} ${url}`).then((ok) => { note.textContent = ok ? 'Challenge link copied! Paste it in the group chat.' : `Send this link: ${url}`; });
  if (navigator.share) navigator.share({ text: line, url }).then(() => { note.textContent = 'Challenge sent. May the best plate win.'; }).catch((e) => { if (e?.name !== 'AbortError' && e?.name !== 'InvalidStateError') fallback(); });
  else fallback();
}
const dailyTag = () => { const d = daily(); return `${APP.name} #${d.n}${d.streak ? ' 🔥' + d.streak : ''}`; };

function caption() {
  const r = state.result;
  const line = state.mode === 'roast' ? `${APP.chef} gave my plate a ${r.score}/10 😤 Think your plate can beat it?`
    : state.mode === 'menu' ? `Tonight at ${APP.restaurant}: “${r.dishName}” for ${r.price}. Get your dinner a fancy menu:`
    : `My fridge just made tonight’s special: “${r.specialName}”. Raid yours:`;
  const url = challengeUrl();
  const tags = ['#ChefGerardo', '#SnootfoodChallenge', MODE_TAG[state.mode]].join(' ');
  const daily = dailyTag();
  return { text: line, url, full: `${line} ${url}\n${tags}${daily ? '\n' + daily : ''}` };
}

const canShareFile = (file) => { try { return !!(navigator.share && navigator.canShare?.({ files: [file] })); } catch { return false; } };
function copyCaption(text) {   // resolves true/false; never throws
  try { return navigator.clipboard ? navigator.clipboard.writeText(text).then(() => true, () => false) : Promise.resolve(false); } catch { return Promise.resolve(false); }
}
function afterShare() { markShared(); maybeNudgeInstall('share'); }

function share() {
  const file = state.card;
  if (!file) {
    // Never await inside the tap: the share sheet needs a fresh user gesture. Get the card ready and ask for one more tap.
    const note = $('#shareNote');
    if (navigator.share) {
      note.textContent = 'One sec… getting your card ready.';
      prerenderCard().then((f) => { if (f) note.textContent = 'Ready! Tap Share again.'; });
    } else {
      note.textContent = 'One sec…';
      prerenderCard().then((f) => f && download(f));   // a download doesn't need the gesture
    }
    return;
  }
  const c = caption();
  if (canShareFile(file)) {
    const copied = copyCaption(c.full);   // not awaited: keep the gesture for navigator.share
    const data = isIOS() ? { files: [file] } : { files: [file], title: APP.name, text: c.full };
    navigator.share(data).then(async () => {
      $('#shareNote').textContent = (await copied) ? 'Caption copied, paste it in your post.' : 'Shared! Enjoy the hype.';
      afterShare();
    }).catch((e) => {
      if (e?.name === 'AbortError' || e?.name === 'InvalidStateError') return;   // closed the sheet, or a share is already open
      download(file);
    });
  } else {
    download(file);
  }
}

function syncShareLabel(file) {
  $('#shareBtn span').textContent = file && canShareFile(file) ? 'Share' : 'Save image';
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  $('#shareNote').textContent = 'Saved! Post it anywhere and tag your friends.';
  if (state.result) copyCaption(caption().full).then((ok) => { if (ok) $('#shareNote').textContent = 'Saved! Caption copied too, so paste it in your post.'; });
  afterShare();
}

// ───────── Mode switching ─────────
function setMode(mode, focus = false) {
  state.mode = mode;
  document.body.dataset.mode = mode;
  if (state.challenge && state.challenge.mode !== mode) $('#challengeBanner').hidden = true;
  document.querySelectorAll('.modes [role=tab]').forEach((t) => {
    const on = t.dataset.mode === mode;
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  $('#introLine').innerHTML = COPY[mode].intro;
  const art = APP.chefArt[mode], ic = $('#introChef');
  $('#introChefSrc').srcset = art.file + '.webp';
  ic.src = art.file + '.png'; ic.width = art.w; ic.height = art.h; ic.alt = chefAlt(mode);
  document.querySelector('.intro .speech').dataset.chef = mode;
  $('#snapLabel').textContent = COPY[mode].snap;
  history.replaceState(null, '', location.pathname + '#' + mode);
  if (state.photo && !$('#result').hidden) { state.roll = 0; run({ demoOnly: true }); }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

// ───────── Plate of the day + streak (QW6) ─────────
function refreshDaily(stamp = false) {
  const d = daily(), line = $('#dailyLine');
  line.replaceChildren(el('span', 'daily-plate', `🍽️ Plate of the day #${d.n}: ${d.theme}`));
  if (d.streak) line.append(' · ', el('span', 'daily-streak' + (stamp ? ' stamp' : ''), `🔥 ${d.streak}-day streak`));
}

// ───────── First-load teaser (no network) ─────────
const SEEN = 'snootfood.seen.v1';
function showTeaser() {
  try { if (localStorage.getItem(SEEN)) return; localStorage.setItem(SEEN, '1'); } catch { return; }
  const r = demoResult('roast', null, 'noodles', 0);
  const t = $('#teaser');
  t.replaceChildren();
  t.append(el('p', 'teaser-eyebrow', `Fresh from ${APP.chef}`));
  const row = el('div', 'teaser-row');
  const thumb = new Image(); thumb.src = 'samples/noodles.jpg'; thumb.alt = 'Sample photo: instant noodles'; thumb.width = 84; thumb.height = 84; thumb.className = 'teaser-thumb';
  const sc = el('div', 'score teaser-score'); sc.setAttribute('role', 'img'); sc.setAttribute('aria-label', `Score: ${r.score} out of 10`);
  sc.innerHTML = `<span aria-hidden="true">${Number(r.score)}<small>/10</small></span>`;
  const txt = el('div', 'teaser-text');
  txt.append(el('h3', null, r.headline), el('p', 'roast-quote', (r.roast.match(/^.*?[.!?](?=\s|$)/) || [r.roast])[0]));
  row.append(thumb, sc, txt);
  const cta = el('button', 'btn btn-small teaser-cta', 'Now roast yours ↓'); cta.type = 'button'; cta.id = 'teaserCta';
  cta.onclick = () => { setMode('roast'); t.hidden = true; $('#capture').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  t.append(row, cta);
  t.hidden = false;
}

// ───────── Wire up ─────────
function init() {
  document.querySelectorAll('[data-app-name]').forEach((e) => (e.textContent = APP.name));
  document.querySelectorAll('[data-app-tagline]').forEach((e) => (e.textContent = APP.tagline));
  document.querySelectorAll('[data-brand]').forEach((e) => (e.textContent = APP.brand));
  if (!APP.isTest) document.querySelectorAll('[data-test-badge],[data-test-note]').forEach((e) => e.remove());

  const list = $('#sampleList');
  for (const s of SAMPLES) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.sample = s.id;
    b.setAttribute('aria-label', `Try sample: ${s.label}`);
    const img = new Image(); img.src = s.src; img.alt = ''; img.width = 160; img.height = 160; img.loading = 'lazy';
    b.append(img, el('span', null, s.label));
    b.onclick = () => { if (s.id === 'fridge' && state.mode !== 'fridge') setMode('fridge'); usePhoto(s.src, s.id); };
    li.append(b); list.append(li);
  }

  const tabs = [...document.querySelectorAll('.modes [role=tab]')];
  tabs.forEach((t, i) => {
    t.onclick = () => setMode(t.dataset.mode);
    t.onkeydown = (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); setMode(tabs[(i + d + tabs.length) % tabs.length].dataset.mode, true); }
    };
  });

  for (const id of ['#cameraInput', '#uploadInput']) {
    $(id).addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) usePhoto(f); e.target.value = ''; });
  }
  $('#shareBtn').onclick = share;
  $('#challengeBtn').onclick = challengeShare;
  $('#againBtn').onclick = () => { state.roll++; run(); };
  $('#editBtn').onclick = () => { if (state.fridge) { state.fridge.confirmed = false; showChecklist(); } };
  $('#newBtn').onclick = () => { state.ctrl?.abort(); clearInterval(retryTimer); setNote(''); setBusy(false); $('#result').hidden = true; $('#intro').hidden = false; state.photo = null; state.fridge = null; window.scrollTo({ top: 0, behavior: 'smooth' }); };
  document.querySelectorAll('input[name=cardSize]').forEach((r) => (r.onchange = () => state.result && prerenderCard()));

  $('#settingsBtn').onclick = openSettings;
  document.querySelectorAll('[data-open-settings]').forEach((b) => (b.onclick = openSettings));
  $('#provider').onchange = syncProviderFields;
  $('#toggleKey').onclick = (e) => {
    const k = $('#apiKey'); const show = k.type === 'password';
    k.type = show ? 'text' : 'password'; e.currentTarget.textContent = show ? 'Hide' : 'Show'; e.currentTarget.setAttribute('aria-pressed', String(show));
  };
  $('#settingsForm').addEventListener('submit', () => {
    const id = $('#provider').value;
    settings.provider = id;
    const key = $('#apiKey').value.trim();
    if (key) settings.keys[id] = key; else delete settings.keys[id];
    const model = $('#model').value.trim();
    if (model && model !== PROVIDERS[id].defaultModel) settings.models[id] = model; else delete settings.models[id];
    settings.forceDemo = $('#forceDemo').checked;
    saveSettings(); refreshDemoPill();
    toast(activeKey() && !settings.forceDemo ? `Saved! Now using ${PROVIDERS[id].label.split(' · ')[0]}.` : usingAI() ? 'Saved! Using the built-in AI.' : 'Saved! Demo mode is on.');
  });
  $('#forgetKey').onclick = () => {
    const id = $('#provider').value;
    delete settings.keys[id]; $('#apiKey').value = '';
    saveSettings(); refreshDemoPill(); toast('Done! Key removed from this device.');
  };

  state.challenge = readChallenge();
  const initial = state.challenge?.mode || location.hash.slice(1);
  setMode(COPY[initial] ? initial : 'menu');   // also replaces the URL with #mode, so a reload doesn't repeat the challenge
  refreshDemoPill();
  refreshDaily();
  inAppHint();
  if (state.challenge) { showChallengeBanner(state.challenge); try { localStorage.setItem(SEEN, '1'); } catch { /* fine */ } }
  else showTeaser();
  prepareCardAssets();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

init();
