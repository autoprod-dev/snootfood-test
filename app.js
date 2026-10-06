import { APP } from './config.js';
import { analyseImage, demoResult, SAMPLES } from './demo.js';
import { PROVIDERS, RELAY_MODEL, analyse, AIError } from './ai.js';
import { renderCard, canvasToBlob, prepareCardAssets } from './card.js';
import { decodeImage, resizeTo, toJpeg, photoCheck, FRIDGE_EDGE, FRIDGE_QUALITY } from './image.js';
import { daily, bumpStreak, markShared } from './daily.js';
import { maybeNudgeInstall, inAppHint } from './install.js';
import { budget, spend, kitchenClosed, closeKitchen, nextResetLocal, ageOk, setAge } from './budget.js';
import { chefSlot, setExpr, play, react, bandFor, stampLine, reducedMotion, preloadExpressions } from './chef.js';
import { sfx, confetti, soundOn, setSound } from './fx.js';

const $ = (s) => document.querySelector(s);
const STORE = 'snootfood.settings.v1';

const COPY = {
  roast: { intro: 'Show me what you’re eating.', eyebrow: 'Chef Roast' },
  menu: { intro: 'Show me dinner. I’ll price it.', eyebrow: 'On the menu tonight' },
  fridge: { intro: 'Open the fridge. Let’s see.', eyebrow: 'Tonight’s special' },
};

// The wait: a title, short lines that rotate every ~2.5 s (no repeats until all are used), and a gag progress bar.
const WAIT = {
  roast: { title: 'Chef is judging your plate.', lines: ['Looking. Judging. Mostly judging.', 'Zooming in. Regretting it.', 'Counting the beans.', 'Checking for vegetables.', 'Hmm.', 'Still looking. Still judging.', 'Almost done. Unfortunately.'], gag: ['Zooming in', 'Counting things', 'Checking for vegetables', 'Forming an opinion', 'Regretting this'] },
  menu: { title: 'Chef is pricing your dinner.', lines: ['Making it sound expensive.', 'Inventing a price.', 'Finding a fancier word.', 'Adding a tiny garnish.', 'Ironing the napkin.', 'Raising the price. Again.'], gag: ['Reading the plate', 'Finding fancier words', 'Inventing a price', 'Adding a zero', 'Adding another zero'] },
  scan: { title: 'Chef is judging your fridge.', lines: ['Opening the door.', 'Reading every label.', 'Ignoring the back jar.', 'Smelling the milk. Bravely.', 'Counting the eggs.', 'Checking the door shelf.'], gag: ['Opening the door', 'Reading labels', 'Smelling the milk', 'Counting eggs', 'Ignoring the back jar'] },
  fridge: { title: 'Chef is planning dinner.', lines: ['Sticking to your list.', 'Picking a pan.', 'Naming it something nice.', 'Counting the eggs.', 'Ignoring the back jar.'], gag: ['Reading your list', 'Picking a pan', 'Doing the math', 'Writing it down', 'Regretting this'] },
};

const DEMO_BANNER = { fridge: 'Not your fridge.', other: 'Not a read of your photo.', live: ' Snap your own for a real one.' };

const QUALITY_WARNING = {
  blurry: 'Blurry. I might have missed stuff.',
  dark: 'Too dark in there. Check the list.',
  too_far: 'Too far away. Check the list.',
  no_food: 'No food spotted. Type what you’ve got.',
};

const state = { mode: 'roast', photo: null, apiDataUrl: null, fridgeDataUrl: null, features: null, sampleId: null, result: null, roll: 0, ctrl: null, card: null, cardKey: '', source: 'demo', fridge: null };

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
  if (closed) b.textContent = `Chef’s off till ${nextResetLocal()}. Demo takes till then.`;
  if (homeChef) setExpr(homeChef, closed ? 'shocked' : 'judging');
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
      else if (d.returnValue === 'no') { setAge(false); settings.forceDemo = true; saveSettings(); refreshDemoPill(); toast('Demo it is. Change it in Settings.'); }
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
  catch { toast('That image won’t open. Try a JPEG or a screenshot.'); return; }
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
  window.scrollTo(0, 0);
  run();
}
const fridgeDataUrl = () => (state.fridgeDataUrl ||= toJpeg(state.photo, FRIDGE_QUALITY).dataUrl);

// ───────── Run a mode ─────────
let lineTimer, gagTimer;
const waitChef = () => $('#waitChefSlot .chef-slot');
// Shuffled bag: every item once before any repeats, and never the same one twice in a row.
function bag(items) {
  let left = [], last = null;
  return () => {
    if (!left.length) { left = items.filter((x) => x !== last || items.length === 1); for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; } }
    last = left.pop(); return last;
  };
}
function setBusy(on, kind = state.mode) {
  const res = $('#result');
  res.setAttribute('aria-busy', String(on));
  $('#loading').hidden = !on;
  clearInterval(lineTimer); clearInterval(gagTimer);
  if (!on) return;
  const w = WAIT[kind] || WAIT.roast, next = bag(w.lines), line = $('#waitLine');
  $('#waitTitle').textContent = w.title;
  const show = () => { line.textContent = next(); line.classList.remove('swap'); void line.offsetWidth; line.classList.add('swap'); };
  show(); lineTimer = setInterval(show, 2500);
  // Gag bar: eases toward 99% (8 s ≈ 55%, 20 s ≈ 89%, 37 s ≈ 98%), then gets stuck there, on purpose.
  const t0 = performance.now(), bar = $('#waitBar'), label = $('#waitLabel');
  const tick = () => {
    const pc = Math.min(99, Math.floor(99 * (1 - Math.exp(-(performance.now() - t0) / 9000))));
    bar.style.width = pc + '%';
    label.textContent = pc >= 98 ? `${w.gag[4]}: 99%… 99%… 99%` : `${w.gag[Math.min(4, Math.floor(pc / 20))]}: ${pc}%`;
  };
  tick(); gagTimer = setInterval(tick, 250);
  showWaitChef('judging');
}
function showWaitChef(expr) {
  const slot = $('#waitChefSlot'), c = waitChef();
  const was = slot.hidden;
  slot.hidden = false; setExpr(c, expr); delete c.dataset.react;
  c.classList.toggle('wobble', expr === 'judging');
  if (was) play(c, 'pop');
  if (expr === 'shocked') c.dataset.react = 'beat';
}

function hideOutputs() { $('#panel').hidden = true; $('#actions').hidden = true; $('#error').hidden = true; endReveal(); }

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
  if (!ai && !demoOnly && why === 'budget') setNote(`Today’s real reads are used up. Demo take. Fresh reads at ${nextResetLocal()}.`, 'budget');
  if (!ai && !demoOnly && why === 'closed') refreshKitchen();

  // Fridge Chef with real AI: step 1 = read the photo into a checklist, step 2 = recipe from the confirmed list.
  if (mode === 'fridge' && ai && (!state.fridge || !state.fridge.confirmed)) {
    if (state.fridge) { showChecklist(); return; }
    const check = photoCheck(state.photo);
    if (check.blank) { showError(check.dark ? 'Pitch black. Turn the fridge light on.' : 'Looks blank. Get closer to the shelves.', mode, true); return; }
    setBusy(true, 'scan');
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
  setBusy(true, mode);
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
      result = demoResult(mode, state.features, state.sampleId);
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
  showResult({ instant: demoOnly });
  if (demoOnly) offerRealTake(mode);
}

// After a tab switch we show a free demo take, plus a button to spend a real read on it.
function offerRealTake(mode) {
  const cost = callCost(mode);
  if (!wantsAI(cost)) return;
  const n = setNote('', 'real-take'); n.hidden = false;
  const b = el('button', 'btn btn-small real-take-btn', budgeted() ? `Get a real read (uses ${cost} of today’s ${budget().left})` : 'Get a real read');
  b.type = 'button'; b.id = 'realTakeBtn';
  b.onclick = () => { setNote(''); run({ force: true }); };
  n.append(b);
}

// Quota and other AI errors. Daily cap → close the kitchen and go straight to a demo; per-minute → retry twice with a countdown.
let retryTimer;
function aiFailed(e, mode, offerManual, attempt) {
  if (e instanceof AIError && e.kind === 'rate_day') {
    closeKitchen(); refreshKitchen();
    state.result = demoResult(mode, state.features, state.sampleId); state.source = 'demo';
    showResult({ instant: true });
    setNote(`Chef’s off till ${nextResetLocal()}. Demo take for now.`, 'closed');
    return;
  }
  if (e instanceof AIError && e.kind === 'rate' && attempt < 2) {
    let left = 20;
    const tick = () => { $('#errorMsg').textContent = `Busy kitchen. Retrying in ${left} s. `; };
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
  showError(e instanceof AIError ? e.message : 'Something broke. Try again.', mode, offerManual);
}

function showError(msg, mode, offerManual, demoLabel = 'Show me a demo') {
  const box = $('#error');
  box.innerHTML = '';
  const m = el('span', null, msg ? msg + ' ' : ''); m.id = 'errorMsg'; box.append(m);
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'link'; b.id = 'demoNowBtn'; b.textContent = demoLabel;
  b.onclick = () => { clearInterval(retryTimer); state.ctrl?.abort(); state.result = demoResult(mode, state.features, state.sampleId); state.source = 'demo'; box.hidden = true; showResult(); };
  box.append(b);
  if (offerManual && mode === 'fridge') {
    const m = document.createElement('button');
    m.type = 'button'; m.className = 'link'; m.id = 'typeInsteadBtn'; m.textContent = 'Type my ingredients';
    m.onclick = () => { state.fridge = makeChecklist({ items: [], photoQuality: 'good', summary: '' }); state.fridge.manual = true; box.hidden = true; showChecklist(); };
    box.append(' · ', m);
  }
  box.hidden = false;
  showWaitChef('shocked');
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
  p.append(el('h2', null, f.manual ? 'What’ve you got?' : f.items.length ? 'Here’s what I see.' : 'Nothing. Not even mustard.'));
  if (f.summary) p.append(el('p', 'desc', f.summary));
  const warn = f.manual ? '' : !f.items.length ? QUALITY_WARNING.no_food : QUALITY_WARNING[f.photoQuality] || '';
  if (warn) p.append(el('p', 'ck-warning', warn));
  p.append(el('p', 'ck-help', f.items.length ? 'Untick what’s wrong. Add what I missed.' : 'Add things one at a time.'));

  const ul = el('ul', 'checklist'); ul.id = 'checklist';
  const count = () => f.items.filter((i) => i.checked && i.name.trim()).length;
  const cook = el('button', 'btn btn-primary btn-xl cook-btn');
  cook.type = 'button'; cook.id = 'cookBtn';
  const refreshCook = () => { const n = count(); cook.disabled = n === 0; cook.textContent = n ? `Cook it (${n} item${n === 1 ? '' : 's'})` : 'Tick something first'; };

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
  addInput.placeholder = f.items.length ? 'Add something I missed' : 'Add an ingredient';
  addInput.setAttribute('aria-label', 'Add an ingredient');
  const addBtn = el('button', 'btn btn-small', 'Add'); addBtn.type = 'submit';
  add.append(addInput, addBtn);
  add.onsubmit = (e) => {
    e.preventDefault();
    const v = addInput.value.trim();
    if (!v) return;
    if (f.items.length >= 30) { toast('30 items max. Plenty.'); return; }
    const it = { id: ++itemSeq, name: v.slice(0, 60), quantity: '', confidence: 'added', note: '', checked: true };
    f.items.push(it); ul.append(renderItem(it)); addInput.value = ''; refreshCook(); addInput.focus();
  };
  p.append(add);

  cook.onclick = () => { f.items = f.items.filter((i) => i.name.trim()); f.confirmed = true; state.roll = 0; run(); };
  refreshCook();
  p.append(cook, el('p', 'safety', 'Only ticked items. Plus oil, salt, pepper.'));
  const retake = el('button', 'btn btn-ghost ck-retake', 'Retake photo'); retake.type = 'button';
  retake.onclick = () => $('#newBtn').click();
  p.append(retake);
  $('#waitChefSlot').hidden = true;
  p.hidden = false;
}

// ───────── Results ─────────
let resultsThisSession = 0;
const shownScore = (r) => (state.mode === 'menu' || r.score == null || !Number.isFinite(Number(r.score)) ? null : Math.max(0, Math.min(10, Math.round(Number(r.score)))));
const shortPrice = (price) => (String(price || '').match(/\$\s?[\d,.]+[kKmM]?/) || [String(price || '$∞').slice(0, 7)])[0].replace(/\s/g, '');
const verdictOf = (r) => (state.mode === 'roast' ? r.headline : r.verdict || r.dishName || r.specialName || '');
const line = (label, text) => { const p = el('p', 'line'); p.append(el('b', null, label + ' '), text); return p; };

function showResult({ instant = false } = {}) {
  const r = state.result, p = $('#panel'), mode = state.mode;
  const st = bumpStreak();
  if (++resultsThisSession === 2) setTimeout(() => maybeNudgeInstall('second-result'), 1200);
  refreshDaily(st.milestone);
  if (st.milestone) toast(`${st.count} days straight. ${APP.chef} is mildly impressed.`);
  const score = shownScore(r), verdict = verdictOf(r);
  p.className = 'panel ' + mode;
  p.replaceChildren();

  // The yellow stamp: score out of 10 (roast, fridge) or the price (menu).
  const sc = el('div', 'score');
  sc.setAttribute('role', 'img');
  if (score != null) {
    sc.setAttribute('aria-label', `${mode === 'fridge' ? 'Fridge rating' : 'Score'}: ${score} out of 10`);
    const n = el('span', null, String(score)); n.setAttribute('aria-hidden', 'true'); n.append(el('small', null, '/10'));
    sc.append(n);
    if (mode === 'fridge') { const k = el('span', 'stamp-kind', 'fridge'); k.setAttribute('aria-hidden', 'true'); sc.prepend(k); }
  } else {
    const pr = shortPrice(r.price);
    sc.classList.add('price'); if (pr.length > 5) sc.classList.add('long');
    sc.setAttribute('aria-label', `Price: ${r.price}`);
    const n = el('span', null, pr); n.setAttribute('aria-hidden', 'true'); sc.append(n);
  }
  const vw = el('div', 'verdict-wrap'), h = el('h2', 'verdict' + (verdict.length > 22 ? ' long' : ''));
  h.append(el('span', null, verdict)); vw.append(h);

  const d = el('div', 'details');
  const chef = chefSlot('judging', 'result-chef flip pop');
  d.append(chef);
  if (state.source === 'demo') {
    const banner = el('p', 'demo-banner'); banner.setAttribute('role', 'note');
    banner.append(el('strong', null, 'DEMO'), ' · sample verdict. ' + DEMO_BANNER[mode === 'fridge' ? 'fridge' : 'other'] + (aiProvider() && !state.sampleId ? DEMO_BANNER.live : ''));
    d.append(banner);
  }
  if (r.isFood === false) d.append(el('p', 'not-food', 'Not sure that’s food. Judged it anyway.'));
  if (mode === 'roast') {
    d.append(el('p', 'stamp-line', stampLine(score, verdict)));
    const vs = challengeVs();
    if (vs) d.append(el('p', 'challenge-line ' + (vs.mine > vs.theirs ? 'won' : vs.mine < vs.theirs ? 'lost' : 'tie'), challengeLine(vs)));
    if (r.compliment) d.append(line('Good:', r.compliment));
    if (r.fix) d.append(line('Fix:', r.fix));
  } else if (mode === 'menu') {
    d.append(el('p', 'eyebrow', COPY.menu.eyebrow), el('h3', 'dish', r.dishName));
    if (r.description) d.append(el('p', 'desc', r.description));
    d.append(line('Price:', r.price));
    if (r.pairing) d.append(line('Pair it with:', r.pairing));
    if (r.spotted?.length) { const ul = el('ul', 'chips'); ul.setAttribute('aria-label', 'Spotted on your plate'); r.spotted.forEach((x) => ul.append(el('li', null, x))); d.append(ul); }
  } else {
    d.append(el('p', 'eyebrow', state.source === 'ai' ? 'Step 2 of 2 · Tonight’s special' : COPY.fridge.eyebrow));
    if (score != null) d.append(el('p', 'stamp-line', stampLine(score, verdict)));
    d.append(el('h3', 'dish', r.specialName));
    if (r.description) d.append(el('p', 'desc', r.description));
    d.append(el('p', 'ingr', 'Made with: ' + r.ingredients.join(' · ')));
    const ol = el('ol', 'steps'); r.steps.forEach((x) => ol.append(el('li', null, x))); d.append(ol);
    d.append(line('Price:', r.price));
    if (r.note) d.append(line('Tip:', r.note));
  }
  d.append(el('p', 'byline', '— ' + APP.chef));
  if (mode === 'fridge') d.append(el('p', 'safety', 'Check dates and allergies. For fun, not advice.'));
  p.append(sc, vw, d);
  $('#waitChefSlot').hidden = true;
  p.hidden = false;
  if (state.challenge?.mode === mode) $('#challengeBanner').hidden = true;
  $('#actions').hidden = false;
  $('#shareBtn').hidden = false;
  $('#editBtn').hidden = !(mode === 'fridge' && state.source === 'ai' && state.fridge);
  $('#shareNote').textContent = '';
  reveal(score, verdict, chef, instant);
  prerenderCard();
}

// ───────── Drumroll → reveal ─────────
// ~1.2 s drumroll (tap anywhere to skip), then the stamp slams, the verdict band stamps in and the chef reacts:
// a quick shocked beat at the slam, then the band's pose: 9–10 chef's kiss, 7–8 slow clap (+ confetti for 7+),
// 5–6 judging, 3–4 disgust, 0–2 faint (+ a droop for ≤4). Reduced motion: instant final pose, no confetti.
let homeChef = null;
const DRUMROLL_MS = 1200;
const BEAT_MS = 380;
let revealTimer = null, revealDone = null, beatTimer = null;
function endReveal() { clearTimeout(revealTimer); clearTimeout(beatTimer); revealDone = null; const res = $('#result'); res.classList.remove('revealing', 'revealed'); delete res.dataset.reveal; }
function reveal(score, verdict, chef, instant) {
  const res = $('#result'), band = bandFor(score), motion = !reducedMotion();
  endReveal();
  res.dataset.band = band;
  const finish = () => {
    if (revealDone !== finish) return;
    revealDone = null; clearTimeout(revealTimer);
    res.classList.remove('revealing'); res.classList.add('revealed'); res.dataset.reveal = 'done';
    chef.classList.remove('wobble');
    clearTimeout(beatTimer);
    if (instant || !motion) react(chef, score);
    else { setExpr(chef, 'shocked'); chef.dataset.react = 'beat'; beatTimer = setTimeout(() => react(chef, score), BEAT_MS); }
    $('#revealLive').textContent = `${score != null ? `${score} out of 10. ` : state.result?.price ? `${state.result.price}. ` : ''}${verdict}`;
    sfx.thud();
    if (band === 'high' || band === 'top') { setTimeout(() => { sfx.ding(); sfx.applause(); }, 220); if (motion) confetti(); }
    else if (band === 'low' || band === 'worst') setTimeout(sfx.trombone, 350);
    else setTimeout(sfx.ding, 200);
  };
  revealDone = finish;
  if (instant || !motion) { finish(); return; }
  res.dataset.reveal = 'drumroll';
  res.classList.add('revealing');
  chef.classList.add('wobble');
  sfx.drumroll(DRUMROLL_MS / 1000);
  revealTimer = setTimeout(finish, DRUMROLL_MS);
}
const skipReveal = () => { if (revealDone && $('#result').dataset.reveal === 'drumroll') revealDone(); };

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
  if (c.mode === 'roast' && c.s != null) p.append('Your friend got ', strong(`${c.s}/10`), ` from ${APP.chef}. Beat it.`);
  else if (c.mode === 'roast') p.append(`Your friend got judged by ${APP.chef}. Your turn.`);
  else if (c.mode === 'menu' && c.p) p.append('Your friend’s dinner: ', strong('$' + Number(c.p).toLocaleString('en-US')), '. Go pricier.');
  else if (c.mode === 'menu') p.append('Your friend’s dinner got priced. Go pricier.');
  else p.append('Your friend’s fridge made dinner. Your turn.');
  b.append(el('span', 'challenge-tag', 'Challenge'), p);
  b.hidden = false;
}
function challengeVs() {   // roast only: { mine, theirs } when this result answers a friend's score
  const c = state.challenge;
  if (!c || c.mode !== 'roast' || c.s == null || state.mode !== 'roast' || !state.result) return null;
  return { mine: Number(state.result.score), theirs: c.s };
}
function challengeLine(vs) {
  if (vs.mine > vs.theirs) return `You beat your friend. ${vs.mine} vs ${vs.theirs}.`;
  if (vs.mine < vs.theirs) return `Your friend wins. ${vs.theirs} vs ${vs.mine}.`;
  return `Tie. ${vs.mine} vs ${vs.theirs}.`;
}
function challengeShare() {
  const r = state.result; if (!r) return;
  const line = state.mode === 'roast' ? `${APP.chef} gave my plate a ${r.score}/10. Think your plate can beat a ${r.score}/10?`
    : state.mode === 'menu' ? `${APP.chef} priced my dinner at ${shortPrice(r.price)}. Go pricier.`
    : `${APP.chef} judged my fridge. Your turn:`;
  const url = challengeUrl(), note = $('#shareNote');
  const fallback = () => copyCaption(`${line} ${url}`).then((ok) => { note.textContent = ok ? 'Challenge link copied. Paste it in the group chat.' : `Send this link: ${url}`; });
  if (navigator.share) navigator.share({ text: line, url }).then(() => { note.textContent = 'Challenge sent.'; }).catch((e) => { if (e?.name !== 'AbortError' && e?.name !== 'InvalidStateError') fallback(); });
  else fallback();
}
const dailyTag = () => { const d = daily(); return `${APP.name} #${d.n}${d.streak ? ' 🔥' + d.streak : ''}`; };

function caption() {
  const r = state.result;
  const v = verdictOf(r), sc = shownScore(r);
  const line = state.mode === 'roast' ? `${APP.chef} gave my plate a ${r.score}/10. “${v}” Think yours can beat it?`
    : state.mode === 'menu' ? `${APP.chef} priced my dinner at ${shortPrice(r.price)}. “${v}” Yours:`
    : `${APP.chef} judged my fridge${sc != null ? ` (${sc}/10)` : ''}. “${v}” Tonight: ${r.specialName}. Yours:`;
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
      note.textContent = 'One sec… card’s almost ready.';
      prerenderCard().then((f) => { if (f) note.textContent = 'Ready. Tap Share again.'; });
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
      $('#shareNote').textContent = (await copied) ? 'Caption copied. Paste it in your post.' : 'Shared.';
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
  $('#shareBtn span').textContent = file && canShareFile(file) ? 'Share the verdict' : 'Save image';
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  $('#shareNote').textContent = 'Saved. Post it anywhere.';
  if (state.result) copyCaption(caption().full).then((ok) => { if (ok) $('#shareNote').textContent = 'Saved. Caption copied too.'; });
  afterShare();
}

// ───────── Mode switching ─────────
function setMode(mode, focus = false) {
  state.mode = mode;
  document.body.dataset.mode = mode;
  if (state.challenge && state.challenge.mode !== mode) $('#challengeBanner').hidden = true;
  document.querySelectorAll('#swapModes [data-swap]').forEach((b) => { b.hidden = b.dataset.swap === mode; });
  document.querySelectorAll('.modes [role=tab]').forEach((t) => {
    const on = t.dataset.mode === mode;
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  $('#introLine').textContent = COPY[mode].intro;
  const say = $('#introLine'); say.style.animation = 'none'; void say.offsetWidth; say.style.animation = '';
  if (homeChef) { setExpr(homeChef, budgeted() && kitchenClosed() ? 'shocked' : 'judging'); play(homeChef, 'pop'); }
  history.replaceState(null, '', location.pathname + '#' + mode);
  if (state.photo && !$('#result').hidden) { state.roll = 0; window.scrollTo(0, 0); run({ demoOnly: true }); }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

// ───────── Plate of the day + streak (QW6) ─────────
function refreshDaily(stamp = false) {
  const d = daily(), line = $('#dailyLine');
  line.replaceChildren(el('span', 'daily-plate', `Plate of the day #${d.n}: ${d.theme}`));
  if (d.streak) line.append(' · ', el('span', 'daily-streak' + (stamp ? ' stamp' : ''), `🔥 ${d.streak}-day streak`));
}

// ───────── First-load teaser (no network) ─────────
const SEEN = 'snootfood.seen.v1';
function showTeaser() {
  try { if (localStorage.getItem(SEEN)) return; localStorage.setItem(SEEN, '1'); } catch { return; }
  const r = demoResult('roast', null, 'noodles');
  const t = $('#teaser');
  t.replaceChildren();
  t.append(el('p', 'teaser-eyebrow', `Fresh verdict · ${APP.chef}`));
  const sc = el('div', 'score teaser-score'); sc.setAttribute('role', 'img'); sc.setAttribute('aria-label', `Score: ${r.score} out of 10`);
  const n = el('span', null, String(Number(r.score))); n.setAttribute('aria-hidden', 'true'); n.append(el('small', null, '/10')); sc.append(n);
  const txt = el('div', 'teaser-text');
  txt.append(el('h3', null, r.headline));
  const cta = el('button', 'btn btn-small btn-primary teaser-cta', 'Now roast yours ↓'); cta.type = 'button'; cta.id = 'teaserCta';
  cta.onclick = () => { setMode('roast'); t.hidden = true; $('#capture').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' }); };
  txt.append(cta);
  t.append(sc, txt);
  t.hidden = false;
}

// ───────── Wire up ─────────
function syncToggles() {
  const on = soundOn(), sb = $('#soundBtn');
  sb.setAttribute('aria-pressed', String(on)); sb.setAttribute('aria-label', on ? 'Sound on. Turn sound off' : 'Sound off. Turn sound on');
  const dark = window.snootTheme?.current() === 'dark';
  $('#themeBtn').setAttribute('aria-label', dark ? 'Dark theme. Switch to light' : 'Light theme. Switch to dark');
}
function init() {
  homeChef = chefSlot(budgeted() && kitchenClosed() ? 'shocked' : 'judging', 'pop'); $('#homeChefSlot').append(homeChef);
  const wc = chefSlot('judging', 'flip'); $('#waitChefSlot').append(wc); $('#waitChefSlot').hidden = true;
  $('#ageChefSlot').append(chefSlot('judging'));
  $('#soundBtn').onclick = () => { setSound(!soundOn()); syncToggles(); if (soundOn()) sfx.ding(); };
  $('#themeBtn').onclick = () => { window.snootTheme?.toggle(); syncToggles(); };
  syncToggles();
  document.addEventListener('pointerdown', skipReveal, true);
  document.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') skipReveal(); }, true);
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
    const img = new Image(); img.src = s.src; img.alt = ''; img.width = 160; img.height = 160;
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
  document.querySelectorAll('#swapModes [data-swap]').forEach((b) => { b.onclick = () => setMode(b.dataset.swap); });
  $('#againBtn').onclick = () => { state.roll++; window.scrollTo(0, 0); run(); };
  $('#editBtn').onclick = () => { if (state.fridge) { state.fridge.confirmed = false; showChecklist(); } };
  $('#newBtn').onclick = () => { state.ctrl?.abort(); clearInterval(retryTimer); setNote(''); setBusy(false); hideOutputs(); $('#result').hidden = true; $('#intro').hidden = false; state.photo = null; state.fridge = null; window.scrollTo(0, 0); if (homeChef) play(homeChef, 'pop'); };
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
    toast(activeKey() && !settings.forceDemo ? `Saved. Using ${PROVIDERS[id].label.split(' · ')[0]}.` : usingAI() ? 'Saved. Using the built-in AI.' : 'Saved. Demo mode.');
  });
  $('#forgetKey').onclick = () => {
    const id = $('#provider').value;
    delete settings.keys[id]; $('#apiKey').value = '';
    saveSettings(); refreshDemoPill(); toast('Key removed from this device.');
  };

  state.challenge = readChallenge();
  const initial = state.challenge?.mode || location.hash.slice(1);
  setMode(COPY[initial] ? initial : 'roast');   // also replaces the URL with #mode, so a reload doesn't repeat the challenge
  refreshDemoPill();
  refreshDaily();
  inAppHint();
  if (state.challenge) { showChallengeBanner(state.challenge); try { localStorage.setItem(SEEN, '1'); } catch { /* fine */ } }
  else showTeaser();
  prepareCardAssets();
  preloadExpressions();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

init();
