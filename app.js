import { APP } from './config.js';
import { analyseImage, demoResult, SAMPLES } from './demo.js';
import { PROVIDERS, analyse, AIError } from './ai.js';
import { renderCard, canvasToBlob, prepareCardAssets } from './card.js';

const $ = (s) => document.querySelector(s);
const STORE = 'snootfood.settings.v1';

const COPY = {
  menu: {
    intro: 'Bonjour. Show me your dinner, even if it is two-minute noodles. <em>Especially</em> if it is two-minute noodles. I shall make it sound like it costs a fortune.',
    snap: 'Snap your meal', eyebrow: 'Ce soir, le chef propose',
    loading: ['Warming the plates…', 'Ironing the tablecloth…', 'Consulting the sommelier (he only drinks cordial)…', 'Adding an unnecessary accent aigu…', 'Calculating an outrageous price…'],
  },
  roast: {
    intro: `I am ${APP.chef}. I have judged ten thousand plates and loved perhaps four. Show me yours. I will be honest. <em>Too</em> honest.`,
    snap: 'Snap your plating', eyebrow: 'Chef Roast',
    loading: ['The chef is squinting…', 'The chef has put on his reading glasses…', 'The moustache is twitching…', 'Sharpening the scorecard…', 'Sighing theatrically…'],
  },
  fridge: {
    intro: 'Open the fridge, snap what you see, and I shall invent tonight’s special. Nobody needs to know about the jar at the back.',
    snap: 'Snap your fridge', eyebrow: 'Tonight’s Special',
    loading: ['Rummaging in the crisper…', 'Sniffing the milk, bravely…', 'Writing on the chalkboard…', 'Ignoring the mystery container…', 'Inventing a French name…'],
  },
};

const state = { mode: 'menu', photo: null, apiDataUrl: null, features: null, sampleId: null, result: null, roll: 0, ctrl: null, card: null, cardKey: '', source: 'demo' };

// ───────── Settings ─────────
function loadSettings() {
  try { return { provider: 'gemini', keys: {}, models: {}, forceDemo: false, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; }
  catch { return { provider: 'gemini', keys: {}, models: {}, forceDemo: false }; }
}
let settings = loadSettings();
const saveSettings = () => localStorage.setItem(STORE, JSON.stringify(settings));
const activeKey = () => (settings.keys[settings.provider] || '').trim();
const usingAI = () => !!activeKey() && !settings.forceDemo;

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
async function decode(fileOrUrl) {
  if (typeof fileOrUrl === 'string') {
    const img = new Image(); img.src = fileOrUrl; await img.decode(); return img;
  }
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(fileOrUrl, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(fileOrUrl);
  try { const img = new Image(); img.src = url; await img.decode(); return img; }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
function resizeTo(src, max) {
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

async function usePhoto(fileOrUrl, sampleId = null) {
  let img;
  try { img = await decode(fileOrUrl); }
  catch { toast('Couldn’t open that image. Try a JPEG or PNG (or a screenshot of it).'); return; }
  state.photo = resizeTo(img, 1440);            // for the on-screen preview and the share card
  const api = resizeTo(img, 1024);              // smaller copy that goes to the AI (if a key is set)
  state.apiDataUrl = api.toDataURL('image/jpeg', 0.8);
  img.close?.();
  state.features = analyseImage(state.photo);
  state.sampleId = sampleId;
  state.roll = 0;
  $('#photo').src = state.photo.toDataURL('image/jpeg', 0.85);
  $('#photo').alt = sampleId ? `Sample photo: ${SAMPLES.find((s) => s.id === sampleId).label}` : 'Your photo';
  $('#intro').hidden = true;
  $('#result').hidden = false;
  run();
}

// ───────── Run a mode ─────────
let loadingTimer;
function setBusy(on) {
  const res = $('#result');
  res.setAttribute('aria-busy', String(on));
  $('#loading').hidden = !on;
  clearInterval(loadingTimer);
  if (on) {
    const lines = COPY[state.mode].loading;
    let i = Math.floor(Math.random() * lines.length);
    $('#loading').textContent = lines[i];
    loadingTimer = setInterval(() => { i = (i + 1) % lines.length; $('#loading').textContent = lines[i]; }, 1100);
  }
}

async function run() {
  state.ctrl?.abort();
  const ctrl = (state.ctrl = new AbortController());
  const mode = state.mode;
  $('#panel').hidden = true; $('#actions').hidden = true; $('#error').hidden = true;
  setBusy(true);
  let result, source;
  try {
    if (usingAI()) {
      result = await analyse({ provider: settings.provider, key: activeKey(), model: settings.models[settings.provider], mode, dataUrl: state.apiDataUrl, signal: ctrl.signal });
      source = 'ai';
    } else {
      await new Promise((r) => setTimeout(r, 650 + Math.random() * 500));
      result = demoResult(mode, state.features, state.sampleId, state.roll);
      source = 'demo';
    }
  } catch (e) {
    if (e.name === 'AbortError' || ctrl.signal.aborted) return;
    setBusy(false);
    const msg = e instanceof AIError ? e.message : 'Something went wrong. Try again.';
    $('#error').innerHTML = '';
    $('#error').append(msg + ' ');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'link'; b.textContent = 'Use a demo result instead';
    b.onclick = () => { state.result = demoResult(mode, state.features, state.sampleId, state.roll); state.source = 'demo'; $('#error').hidden = true; showResult(); };
    $('#error').append(b);
    $('#error').hidden = false;
    $('#actions').hidden = false;
    $('#shareBtn').hidden = true;
    return;
  }
  if (ctrl.signal.aborted || mode !== state.mode) return;
  setBusy(false);
  state.result = result; state.source = source;
  showResult();
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function showResult() {
  const r = state.result, p = $('#panel');
  p.className = 'panel ' + state.mode;
  p.replaceChildren();
  const eyebrow = el('p', 'eyebrow', COPY[state.mode].eyebrow);
  if (state.source === 'demo') eyebrow.append(el('span', 'demo-tag', 'DEMO'));
  p.append(eyebrow);
  if (state.mode === 'menu') {
    p.append(el('h2', null, r.dishName), el('p', 'desc', r.description));
    const pr = el('div', 'price-row'); pr.append(el('span', 'price', r.price)); p.append(pr);
    const n = el('p', 'notes'); n.append(el('b', null, 'NOTES DU CHEF'), '“' + r.chefNotes + '”'); p.append(n);
    p.append(el('p', 'pairing', 'Pairs with: ' + r.pairing));
    if (r.spotted?.length) { const ul = el('ul', 'chips'); ul.setAttribute('aria-label', 'Spotted on the plate'); r.spotted.forEach((s) => ul.append(el('li', null, s))); p.append(ul); }
  } else if (state.mode === 'roast') {
    const top = el('div', 'roast-top');
    const sc = el('div', 'score'); sc.setAttribute('role', 'img'); sc.setAttribute('aria-label', `Score: ${r.score} out of 10`);
    sc.innerHTML = `<span aria-hidden="true">${r.score}<small>/10</small></span>`;
    top.append(sc, el('h2', null, r.headline)); p.append(top);
    p.append(el('p', 'roast-quote', r.roast), el('p', 'good', '✓ ' + r.compliment), el('p', 'tip', 'Chef’s tip: ' + r.fix), el('p', 'byline', '— ' + APP.chef));
  } else {
    p.append(el('h2', null, r.specialName), el('p', 'desc', r.description), el('p', 'ingr', 'With ' + r.ingredients.join(' · ')));
    const ol = el('ol'); r.steps.forEach((s) => ol.append(el('li', null, s))); p.append(ol);
    const row = el('p'); row.append(el('span', 'fprice', r.price)); p.append(row);
    p.append(el('p', 'fnote', '“' + r.note + '”'), el('p', 'safety', 'Check use-by dates and allergies before cooking. This is a bit of fun, not a recipe guarantee.'));
  }
  if (r.isFood === false) p.prepend(el('p', 'error', 'Hmm, the chef isn’t convinced that’s food, but he played along anyway.'));
  p.hidden = false;
  $('#actions').hidden = false;
  $('#shareBtn').hidden = false;
  $('#againBtn').textContent = state.source === 'demo' ? 'Another take' : 'Ask again';
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
  if (state.mode === 'menu') return `Tonight at ${APP.restaurant}: “${r.dishName}”, ${r.price}. Make your own:`;
  if (state.mode === 'roast') return `${APP.chef} gave my plating ${r.score}/10 😤 Get roasted:`;
  return `Tonight’s special from my fridge: “${r.specialName}”. Try it:`;
}

async function share() {
  const btn = $('#shareBtn');
  btn.disabled = true;
  try {
    const file = state.card || (await prerenderCard());
    if (!file) return;
    const data = { files: [file], title: APP.name, text: `${shareText()} ${APP.url}` };
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share(data); $('#shareNote').textContent = 'Shared. Bon appétit!'; }
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
  $('#shareNote').textContent = 'Image saved. Post it anywhere and tag your mates.';
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
  $('#newBtn').onclick = () => { state.ctrl?.abort(); setBusy(false); $('#result').hidden = true; $('#intro').hidden = false; state.photo = null; window.scrollTo({ top: 0, behavior: 'smooth' }); };
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
    toast(usingAI() ? `Saved. Using ${PROVIDERS[id].label.split(' · ')[0]}.` : 'Saved. Demo mode is on.');
  });
  $('#forgetKey').onclick = () => {
    const id = $('#provider').value;
    delete settings.keys[id]; $('#apiKey').value = '';
    saveSettings(); refreshDemoPill(); toast('Key removed from this device.');
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
