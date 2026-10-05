import { APP } from './config.js';
import { analyseImage, demoResult, SAMPLES } from './demo.js';
import { PROVIDERS, RELAY_MODEL, analyse, AIError } from './ai.js';
import { renderCard, canvasToBlob, prepareCardAssets } from './card.js';
import { decodeImage, resizeTo, toJpeg, photoCheck, FRIDGE_EDGE, FRIDGE_QUALITY } from './image.js';

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

function refreshDemoPill() { $('#demoPill').hidden = usingAI(); }

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

async function run() {
  state.ctrl?.abort();
  const ctrl = (state.ctrl = new AbortController());
  const mode = state.mode;
  hideOutputs();
  // Fridge Chef with real AI: step 1 = read the photo into a checklist, step 2 = recipe from the confirmed list.
  if (mode === 'fridge' && usingAI() && (!state.fridge || !state.fridge.confirmed)) {
    if (state.fridge) { showChecklist(); return; }
    const check = photoCheck(state.photo);
    if (check.blank) { showError(check.dark ? 'That photo’s basically pitch black. Try again with the fridge light on!' : 'That photo looks blank to me. Try a closer shot of your fridge shelves.', mode, true); return; }
    setBusy(true, COPY.fridge.scanLoading);
    try {
      const scan = await analyse({ ...aiArgs(), task: 'fridgeScan', dataUrl: fridgeDataUrl(), signal: ctrl.signal });
      if (ctrl.signal.aborted || mode !== state.mode) return;
      setBusy(false);
      state.fridge = makeChecklist(scan);
      showChecklist();
    } catch (e) {
      if (e.name === 'AbortError' || ctrl.signal.aborted) return;
      setBusy(false);
      showError(e instanceof AIError ? e.message : 'Oops, something went sideways. Give it another shot.', mode, true);
    }
    return;
  }
  setBusy(true, mode === 'fridge' && usingAI() ? COPY.fridge.recipeLoading : COPY[mode].loading);
  let result, source;
  try {
    if (usingAI()) {
      if (mode === 'fridge') {
        const ingredients = state.fridge.items.filter((i) => i.checked && i.name.trim()).map(({ name, quantity }) => ({ name: name.trim(), quantity: quantity.trim() }));
        result = await analyse({ ...aiArgs(), task: 'fridgeRecipe', input: { ingredients, roll: state.roll }, signal: ctrl.signal });
      } else {
        result = await analyse({ ...aiArgs(), task: mode, dataUrl: state.apiDataUrl, signal: ctrl.signal });
      }
      source = 'ai';
    } else {
      await new Promise((r) => setTimeout(r, 650 + Math.random() * 500));
      result = demoResult(mode, state.features, state.sampleId, state.roll);
      source = 'demo';
    }
  } catch (e) {
    if (e.name === 'AbortError' || ctrl.signal.aborted) return;
    setBusy(false);
    showError(e instanceof AIError ? e.message : 'Oops, something went sideways. Give it another shot.', mode, false);
    return;
  }
  if (ctrl.signal.aborted || mode !== state.mode) return;
  setBusy(false);
  state.result = result; state.source = source;
  showResult();
}

function showError(msg, mode, offerManual) {
  const box = $('#error');
  box.innerHTML = '';
  box.append(msg + ' ');
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'link'; b.textContent = 'Show me a demo result instead';
  b.onclick = () => { state.result = demoResult(mode, state.features, state.sampleId, state.roll); state.source = 'demo'; box.hidden = true; showResult(); };
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
function showResult() {
  const r = state.result, p = $('#panel');
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
    p.append(el('p', 'roast-quote', r.roast), el('p', 'good', '✓ ' + r.compliment), el('p', 'tip', 'Pro tip: ' + r.fix), chefSign('roast'));
  } else {
    p.append(el('h2', null, r.specialName), el('p', 'desc', r.description), el('p', 'ingr', 'Made with: ' + r.ingredients.join(' · ')));
    const ol = el('ol'); r.steps.forEach((s) => ol.append(el('li', null, s))); p.append(ol);
    const row = el('p'); row.append(el('span', 'fprice', r.price)); p.append(row);
    p.append(el('p', 'fnote', '“' + r.note + '”'), chefSign('fridge'), el('p', 'safety', 'Quick reminder: check expiration dates and allergies before you cook. This is for fun, not a guaranteed recipe.'));
  }
  if (r.isFood === false) p.prepend(el('p', 'error', 'Hmm, Chef’s not totally sure that’s food, but he rolled with it anyway.'));
  p.hidden = false;
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
  const key = JSON.stringify([state.mode, state.result, cardSize()]);
  if (state.cardKey === key && state.card) return state.card;
  state.cardKey = key; state.card = null;
  const canvas = await renderCard(state.mode, state.result, state.photo, { story: cardSize() === 'story' });
  const blob = await canvasToBlob(canvas);
  if (state.cardKey !== key) return null;
  const name = `${APP.name.toLowerCase()}-${state.mode}-${Date.now().toString(36)}.png`;
  state.card = new File([blob], name, { type: 'image/png' });
  return state.card;
}

function shareText() {
  const r = state.result;
  if (state.mode === 'menu') return `Tonight at ${APP.restaurant}: “${r.dishName}” for ${r.price}. Get your own fancy menu:`;
  if (state.mode === 'roast') return `${APP.chef} gave my plating a ${r.score}/10 😤 Think you can beat it?`;
  return `My fridge just made tonight’s special: “${r.specialName}”. Raid yours:`;
}

async function share() {
  const btn = $('#shareBtn');
  btn.disabled = true;
  try {
    const file = state.card || (await prerenderCard());
    if (!file) return;
    const data = { files: [file], title: APP.name, text: `${shareText()} ${APP.url}` };
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share(data); $('#shareNote').textContent = 'Shared! Enjoy the hype.'; }
      catch (e) { if (e.name !== 'AbortError') download(file); }
    } else {
      download(file);
    }
  } finally { btn.disabled = false; }
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  $('#shareNote').textContent = 'Saved! Post it anywhere and tag your friends.';
}

// ───────── Mode switching ─────────
function setMode(mode, focus = false) {
  state.mode = mode;
  document.body.dataset.mode = mode;
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
  history.replaceState(null, '', '#' + mode);
  if (state.photo && !$('#result').hidden) { state.roll = 0; run(); }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
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
  $('#againBtn').onclick = () => { state.roll++; run(); };
  $('#editBtn').onclick = () => { if (state.fridge) { state.fridge.confirmed = false; showChecklist(); } };
  $('#newBtn').onclick = () => { state.ctrl?.abort(); setBusy(false); $('#result').hidden = true; $('#intro').hidden = false; state.photo = null; state.fridge = null; window.scrollTo({ top: 0, behavior: 'smooth' }); };
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

  const initial = location.hash.slice(1);
  setMode(COPY[initial] ? initial : 'menu');
  refreshDemoPill();
  prepareCardAssets();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

init();
