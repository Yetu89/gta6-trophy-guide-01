// GTA VI trophy guide and tracker: checklist saved in localStorage, filters,
// spoiler-safe mode, export/import, and a five-stage roadmap to the platinum.
// All trophy data lives in data/trophies.json; this file only renders it.
const STORE_KEY = 'gta6-trophy-guide-01-earned-v1';
// Counters (n/target) live under a separate versioned key so the earned
// ticks above are never disturbed by a progress-format change.
const PROGRESS_KEY = 'gta6-trophy-guide-01-progress-v1';
const listEl = document.getElementById('trophyList');
const emptyEl = document.getElementById('emptyState');
const searchEl = document.getElementById('search');
const gradeEl = document.getElementById('grade');
const earnedOnlyEl = document.getElementById('earnedOnly');
const spoilerEl = document.getElementById('spoiler');
const kindRow = document.getElementById('kindRow');
const resultCountEl = document.getElementById('resultCount');
const progressTextEl = document.getElementById('progressText');
const progressPctEl = document.getElementById('progressPct');
const progressFillEl = document.getElementById('progressFill');
const gradeCountsEl = document.getElementById('gradeCounts');
const saveNoteEl = document.getElementById('saveNote');

const state = {
  trophies: [],
  earned: new Set(),
  // progress: trophy id -> counted amount (only for trophies with a target)
  progress: {},
  // autoEarned: ids ticked earned by a counter reaching its target, so a
  // manual tick is never undone by lowering a counter.
  autoEarned: new Set(),
  kind: 'all',
  grade: 'all',
  query: '',
  earnedOnly: false,
  spoiler: false,
  openId: null,
};

function loadEarned() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((n) => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}

function saveEarned() {
  localStorage.setItem(STORE_KEY, JSON.stringify([...state.earned].sort((a, b) => a - b)));
  saveNoteEl.textContent = 'Saved in this browser just now.';
}

function trophyById(id) {
  return state.trophies.find((t) => t.id === id);
}

function clampProgress(t, value) {
  if (!t || !t.progress_target) return 0;
  const n = Number.isInteger(value) ? value : Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(t.progress_target, n));
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (!data || typeof data !== 'object') return { progress: {}, autoEarned: new Set() };
    const progress = {};
    const counts = data.progress && typeof data.progress === 'object' ? data.progress : {};
    for (const [key, value] of Object.entries(counts)) {
      const id = Number(key);
      const t = trophyById(id);
      if (t && t.progress_target) progress[id] = clampProgress(t, value);
    }
    const auto = Array.isArray(data.autoEarned) ? data.autoEarned.filter((n) => Number.isInteger(n)) : [];
    return { progress, autoEarned: new Set(auto) };
  } catch {
    return { progress: {}, autoEarned: new Set() };
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify({
    progress: state.progress,
    autoEarned: [...state.autoEarned].sort((a, b) => a - b),
  }));
}

function formatCount(t, value) {
  if (t.progress_unit === '$') return '$' + value.toLocaleString('en-US');
  return String(value);
}

// Set a counter. Reaching the target ticks the trophy earned automatically;
// dropping back below the target unticks it again — but only when the tick
// came from the counter, never a manual tick.
function setProgress(id, value) {
  const t = trophyById(id);
  if (!t || !t.progress_target) return;
  const next = clampProgress(t, value);
  state.progress[id] = next;
  if (next >= t.progress_target) {
    state.earned.add(id);
    state.autoEarned.add(id);
  } else if (state.autoEarned.has(id)) {
    state.earned.delete(id);
    state.autoEarned.delete(id);
  }
  saveProgress();
  saveEarned();
  renderAll();
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('spoiler') === 'on') state.spoiler = true;
  const kind = params.get('kind');
  if (kind && ['story', 'missable', 'collectibles', 'activities', 'online'].includes(kind)) state.kind = kind;
  const grade = params.get('grade');
  if (grade && ['platinum', 'gold', 'silver', 'bronze'].includes(grade)) state.grade = grade;
  if (params.get('earned') === 'only') state.earnedOnly = true;
  const open = Number(params.get('open'));
  if (Number.isInteger(open) && open >= 1 && open <= 55) state.openId = open;
  if (params.get('view') === 'roadmap') state.pendingView = 'roadmap';
  if (params.get('view') === 'list') state.pendingView = 'list';
}

function gradeLabel(grade) {
  return grade.charAt(0).toUpperCase() + grade.slice(1);
}

function kindLabel(kind) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function isHiddenFromViewer(t) {
  return state.spoiler && t.hidden && !state.earned.has(t.id);
}

function trophyMatches(t) {
  if (state.kind === 'online') return false;
  if (state.kind === 'missable' && !t.missable) return false;
  if (state.kind !== 'all' && state.kind !== 'missable' && t.kind !== state.kind) return false;
  if (state.grade !== 'all' && t.grade !== state.grade) return false;
  if (state.earnedOnly && !state.earned.has(t.id)) return false;
  if (state.query) {
    const q = state.query.toLowerCase();
    const locText = (t.locations || []).map((l) => l.label).join(' ');
    const hay = (t.name + ' ' + t.description + ' ' + t.guide + ' ' + locText).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function renderProgress() {
  const total = state.trophies.length;
  const earned = state.earned.size;
  const pct = total ? Math.round((earned / total) * 100) : 0;
  progressTextEl.textContent = earned + ' of ' + total + ' earned';
  progressPctEl.textContent = pct + '% to platinum';
  progressFillEl.style.width = pct + '%';
  const counts = {};
  for (const t of state.trophies) {
    counts[t.grade] = counts[t.grade] || { got: 0, total: 0 };
    counts[t.grade].total += 1;
    if (state.earned.has(t.id)) counts[t.grade].got += 1;
  }
  gradeCountsEl.replaceChildren();
  for (const grade of ['platinum', 'gold', 'silver', 'bronze']) {
    const c = counts[grade];
    if (!c) continue;
    const chip = document.createElement('span');
    chip.textContent = gradeLabel(grade) + ' ' + c.got + '/' + c.total;
    gradeCountsEl.append(chip);
  }
}

function renderRoadmap() {
  for (let stage = 1; stage <= 5; stage++) {
    const ul = document.querySelector('.stage-list[data-stage="' + stage + '"]');
    if (!ul) continue;
    ul.replaceChildren();
    for (const t of state.trophies.filter((x) => x.roadmap_stage === stage)) {
      const li = document.createElement('li');
      const hidden = isHiddenFromViewer(t);
      li.textContent = hidden ? 'Hidden trophy' : t.name;
      if (t.missable) {
        const mark = document.createElement('span');
        mark.className = 'miss';
        mark.textContent = ' ⚠ missable';
        li.append(mark);
      }
      if (state.earned.has(t.id)) li.classList.add('done');
      ul.append(li);
    }
  }
}

function trophyCard(t) {
  const card = document.createElement('article');
  card.className = 'trophy' + (state.earned.has(t.id) ? ' earned' : '');
  card.dataset.id = String(t.id);
  const hidden = isHiddenFromViewer(t);

  const top = document.createElement('div');
  top.className = 'trophy-top';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = state.earned.has(t.id);
  box.setAttribute('aria-label', 'Mark trophy ' + t.id + ' as earned');
  box.addEventListener('click', (event) => event.stopPropagation());
  box.addEventListener('change', () => {
    if (box.checked) state.earned.add(t.id);
    else {
      state.earned.delete(t.id);
      // A manual untick overrides the counter: it must not re-tick the
      // trophy until the counter is moved again.
      state.autoEarned.delete(t.id);
      saveProgress();
    }
    saveEarned();
    renderAll();
  });
  const text = document.createElement('div');
  const name = document.createElement('p');
  name.className = 'trophy-name';
  name.textContent = hidden ? 'Hidden trophy — earn it to reveal' : t.name;
  if (state.earned.has(t.id)) {
    const mark = document.createElement('span');
    mark.className = 'earned-mark';
    mark.textContent = ' ✓ earned';
    name.append(mark);
  }
  const desc = document.createElement('p');
  desc.className = 'trophy-desc';
  if (hidden) {
    desc.textContent = 'Hidden trophy — earn it to reveal';
    desc.classList.add('spoiler-hidden');
  } else {
    desc.textContent = t.description;
  }
  text.append(name, desc);
  top.append(box, text);
  card.append(top);

  const tags = document.createElement('div');
  tags.className = 'trophy-tags';
  const gradeBadge = document.createElement('span');
  gradeBadge.className = 'badge ' + t.grade;
  gradeBadge.textContent = gradeLabel(t.grade);
  tags.append(gradeBadge);
  const kindTag = document.createElement('span');
  kindTag.className = 'tag';
  kindTag.textContent = kindLabel(t.kind);
  tags.append(kindTag);
  if (t.missable) {
    const miss = document.createElement('span');
    miss.className = 'tag missable';
    miss.textContent = '⚠ Missable';
    tags.append(miss);
  }
  if (t.hidden) {
    const hid = document.createElement('span');
    hid.className = 'tag hidden-tag';
    hid.textContent = 'Hidden on PlayStation';
    tags.append(hid);
  }
  const stageTag = document.createElement('span');
  stageTag.className = 'tag';
  stageTag.textContent = 'Roadmap stage ' + t.roadmap_stage;
  tags.append(stageTag);
  card.append(tags);

  // Progress counter. Shown even in spoiler-safe mode: a bare "0/18 spots"
  // reveals no story detail, and hiding it would make the counter useless
  // exactly when the trophy name is hidden.
  if (t.progress_target) {
    const value = state.progress[t.id] || 0;
    const counter = document.createElement('div');
    counter.className = 'counter' + (value >= t.progress_target ? ' complete' : '');
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'counter-btn';
    minus.textContent = '−';
    minus.setAttribute('aria-label', 'Decrease progress for trophy ' + t.id);
    minus.disabled = value <= 0;
    minus.addEventListener('click', (event) => {
      event.stopPropagation();
      setProgress(t.id, value - 1);
    });
    const readout = document.createElement('span');
    readout.className = 'counter-value';
    readout.textContent = formatCount(t, value) + ' / ' + formatCount(t, t.progress_target) +
      (t.progress_unit === '$' ? '' : ' ' + t.progress_unit);
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'counter-btn';
    plus.textContent = '+';
    plus.setAttribute('aria-label', 'Increase progress for trophy ' + t.id);
    plus.disabled = value >= t.progress_target;
    plus.addEventListener('click', (event) => {
      event.stopPropagation();
      setProgress(t.id, value + 1);
    });
    const hint = document.createElement('span');
    hint.className = 'counter-hint';
    hint.textContent = 'Hit the target and this trophy is ticked earned; drop below it and the tick is removed.';
    counter.append(minus, readout, plus, hint);
    card.append(counter);
  }

  if (state.openId === t.id && !hidden) {
    const detail = document.createElement('div');
    detail.className = 'trophy-detail';
    const guideHead = document.createElement('h4');
    guideHead.textContent = 'Guide';
    const guide = document.createElement('p');
    guide.textContent = t.guide;
    detail.append(guideHead, guide);
    const stepsHead = document.createElement('h4');
    stepsHead.textContent = 'Steps';
    const steps = document.createElement('ol');
    for (const step of t.steps) {
      const li = document.createElement('li');
      li.textContent = step;
      steps.append(li);
    }
    detail.append(stepsHead, steps);
    if (t.locations && t.locations.length) {
      const locHead = document.createElement('h4');
      locHead.textContent = 'Community-reported locations — UNVERIFIED';
      const locIntro = document.createElement('p');
      locIntro.className = 'locations-intro';
      locIntro.textContent = 'Reported by players and guide sites on launch day, not confirmed by Rockstar. Check each one in your own game before relying on it.';
      const locList = document.createElement('ul');
      locList.className = 'locations-list';
      for (const loc of t.locations) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = loc.label;
        const src = document.createElement('span');
        src.className = 'loc-source';
        src.textContent = ' — ' + loc.source;
        li.append(label, src);
        locList.append(li);
      }
      detail.append(locHead, locIntro, locList);
    }
    if (t.locations_note) {
      const note = document.createElement('p');
      note.className = 'locations-note';
      note.textContent = t.locations_note;
      detail.append(note);
    }
    if (t.missable && t.when_missed) {
      const missBox = document.createElement('p');
      missBox.className = 'miss-note';
      missBox.textContent = 'When it can be missed: ' + t.when_missed;
      detail.append(missBox);
    }
    const sourceHead = document.createElement('h4');
    sourceHead.textContent = 'Source';
    const source = document.createElement('p');
    source.className = 'source-line';
    const strong = document.createElement('strong');
    strong.textContent = t.source.name;
    source.append(strong, document.createTextNode(' — ' + t.source.url));
    detail.append(sourceHead, source);
    card.append(detail);
  } else if (state.openId === t.id && hidden) {
    const detail = document.createElement('div');
    detail.className = 'trophy-detail';
    const note = document.createElement('p');
    note.className = 'spoiler-hidden';
    note.textContent = 'Spoiler-safe mode is on: tick this trophy as earned to reveal its guide.';
    detail.append(note);
    card.append(detail);
  }

  card.addEventListener('click', () => {
    state.openId = state.openId === t.id ? null : t.id;
    renderAll();
  });
  return card;
}

function renderList() {
  listEl.replaceChildren();
  const shown = state.trophies.filter(trophyMatches);
  for (const t of shown) listEl.append(trophyCard(t));
  if (state.kind === 'online') {
    emptyEl.hidden = false;
    emptyEl.textContent = 'No online trophies: all 55 trophies are single-player, so there is nothing to earn online. (Source: GTA 6 achievements list — GTAViceCityHub.)';
  } else if (shown.length === 0) {
    emptyEl.hidden = false;
    emptyEl.textContent = 'No trophies match these filters. Try clearing the search or a filter.';
  } else {
    emptyEl.hidden = true;
  }
  resultCountEl.textContent = 'Showing ' + shown.length + ' of ' + state.trophies.length + ' trophies' +
    (state.earned.size ? ' — ' + state.earned.size + ' earned' : '');
}

function renderAll() {
  renderProgress();
  renderRoadmap();
  renderList();
}

function syncControls() {
  searchEl.value = state.query;
  gradeEl.value = state.grade;
  earnedOnlyEl.checked = state.earnedOnly;
  spoilerEl.checked = state.spoiler;
  for (const btn of kindRow.querySelectorAll('.kind-btn')) {
    btn.classList.toggle('active', btn.dataset.kind === state.kind);
  }
}

function exportProgress() {
  const payload = {
    game: 'Grand Theft Auto VI',
    exported: new Date().toISOString(),
    earned: [...state.earned].sort((a, b) => a - b),
    progress: state.progress,
    autoEarned: [...state.autoEarned].sort((a, b) => a - b),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gta6-trophy-progress.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importProgress(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const ids = Array.isArray(data) ? data : data.earned;
    if (!Array.isArray(ids)) throw new Error('bad file');
    const valid = new Set(state.trophies.map((t) => t.id));
    state.earned = new Set(ids.filter((n) => Number.isInteger(n) && valid.has(n)));
    // Counters: accept the current {progress, autoEarned} shape, and fall
    // back to empty counters for old exports that only carried earned ids.
    const counts = data && typeof data === 'object' && !Array.isArray(data) ? data.progress : null;
    const nextProgress = {};
    if (counts && typeof counts === 'object') {
      for (const [key, value] of Object.entries(counts)) {
        const id = Number(key);
        const t = trophyById(id);
        if (t && t.progress_target) nextProgress[id] = clampProgress(t, value);
      }
    }
    state.progress = nextProgress;
    const auto = data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.autoEarned)
      ? data.autoEarned.filter((n) => Number.isInteger(n) && valid.has(n)) : [];
    state.autoEarned = new Set(auto);
    saveProgress();
    saveEarned();
    renderAll();
    saveNoteEl.textContent = 'Progress imported: ' + state.earned.size + ' trophies earned.';
  } catch {
    saveNoteEl.textContent = 'That file could not be imported — it is not a progress file from this guide.';
  }
}

searchEl.addEventListener('input', () => {
  state.query = searchEl.value.trim();
  state.openId = null;
  renderList();
});
gradeEl.addEventListener('change', () => {
  state.grade = gradeEl.value;
  renderList();
});
earnedOnlyEl.addEventListener('change', () => {
  state.earnedOnly = earnedOnlyEl.checked;
  renderList();
});
spoilerEl.addEventListener('change', () => {
  state.spoiler = spoilerEl.checked;
  renderAll();
});
kindRow.addEventListener('click', (event) => {
  const btn = event.target.closest('.kind-btn');
  if (!btn) return;
  state.kind = btn.dataset.kind;
  syncControls();
  renderList();
});
document.getElementById('exportBtn').addEventListener('click', exportProgress);
document.getElementById('importFile').addEventListener('change', (event) => {
  importProgress(event.target.files[0]);
  event.target.value = '';
});
document.getElementById('resetBtn').addEventListener('click', () => {
  if (window.confirm('Reset all progress? This clears every tick and every counter.')) {
    state.earned = new Set();
    state.progress = {};
    state.autoEarned = new Set();
    saveProgress();
    saveEarned();
    renderAll();
  }
});

const doc = await (await fetch('data/trophies.json')).json();
state.trophies = doc.trophies;
state.earned = loadEarned();
const savedProgress = loadProgress();
state.progress = savedProgress.progress;
state.autoEarned = savedProgress.autoEarned;
readHash();
syncControls();
renderAll();
// Scroll only after the list has rendered and layout has settled, so a
// screenshot URL lands on the right place instead of an empty stretch.
setTimeout(() => {
  if (state.pendingView === 'roadmap') {
    document.getElementById('roadmap').scrollIntoView();
  } else if (state.pendingView === 'list') {
    document.getElementById('listHeading').scrollIntoView();
  } else if (state.openId !== null) {
    const openCard = listEl.querySelector('[data-id="' + state.openId + '"]');
    if (openCard) openCard.scrollIntoView({ block: 'center' });
  }
}, 150);
