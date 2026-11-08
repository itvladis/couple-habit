// Habit Builder — local Figma plugin that builds the habit tracker mockups.
// Run in Figma desktop: Plugins → Development → Habit Builder.
// Each run executes STEP and closes with a toast describing the result.

const STEP = 'all';

// ---------- Constants ----------
const DARK_VAR_NUM = {
  'bg/base': 4, 'bg/surface': 5, 'bg/surface-2': 6, 'border/subtle': 7,
  'text/primary': 8, 'text/secondary': 9, 'text/tertiary': 10, 'tabbar/bg': 11,
};
// Variables added by the plugin itself (both theme collections), value per theme.
const EXTRA_VARS = { 'control/selected': { dark: '5B5B61', light: 'FFFFFF', scopes: ['FRAME_FILL', 'SHAPE_FILL'] } };
const HABIT = { mint: '7FE0D0', lavender: 'A9A4FF', pink: 'F49AC1', sky: '8FB8FF', green: '8EE3A5', peach: 'F2C9A0', coral: 'FF9F8A', gold: 'F5D27A' };
const HUE_MAP = {
  '7fe0d0': '1FA894', 'a9a4ff': '6E66F2', 'f49ac1': 'D9508C', '8fb8ff': '3B7BE0', '8ee3a5': '2F9E55',
  'f2c9a0': 'C77B33', 'ff9f8a': 'E0573C', 'f5d27a': 'B8890F', '0a0a0b': 'FFFFFF', 'ebebf5': '3C3C43',
};
const LIGHT_BG = 'F2F1F7';
const AVATAR_COLORS = { 'В': ['7AA7FF', '4E6BF2'], 'М': ['FF9EC4', 'E0569A'], 'Д': ['FFC97A', 'F08A3C'], 'А': ['8EE3A5', '2F9E55'] };
const IDS = { components: '3:2', card: '3:62', avatar: '3:60' };
/** Extra room below the sheet row; 0 keeps the old layout. */
const ROW_SHIFT = 400;
/** 24 px of padding plus a 44 px safe area (Android variants trim 44 px from the bottom). */
const SHEET_BOTTOM_PAD = 68;
/** The dimmed screen shows this much above the sheet. */
const SHEET_TOP = 54;
const COL = { iosDark: 900, iosLight: 1370, andDark: 1840, andLight: 2280 };
// The sheet row is a long frame (~1100 px), so the rows below it start lower.
const SCREENS = [
  { key: 'detail', title: 'Привычка', y: 1000 },
  { key: 'sheet', title: 'Новая привычка', y: 2000 },
  { key: 'feed', title: 'Лента', y: ROW_SHIFT + 3000 },
  { key: 'profile', title: 'Профиль', y: ROW_SHIFT + 4000 },
  { key: 'invite', title: 'Инвайт', y: ROW_SHIFT + 5000 },
];
const NEW_ICONS = {
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  contrast: '<circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12v12z"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
};

// ---------- Helpers ----------
const rgb = h => { const n = parseInt(h, 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }; };
const toHex = c => [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const VARS = {};
let ICON = {};
let CARD = null;
let AVATAR = null;

async function loadFonts() {
  const inter = ['Bold', 'Semi Bold', 'Medium', 'Regular'].map(s => figma.loadFontAsync({ family: 'Inter', style: s }));
  const roboto = ['Bold', 'SemiBold', 'Medium', 'Regular'].map(s => figma.loadFontAsync({ family: 'Roboto', style: s }));
  await Promise.all(inter.concat(roboto));
}

async function themeCollections() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const dark = cols.find(c => c.name === 'Theme / Dark');
  const light = cols.find(c => c.name === 'Theme / Light');
  if (!dark || !light) throw new Error('Не найдены коллекции Theme / Dark и Theme / Light');
  return { dark: dark, light: light };
}
async function ensureExtraVars() {
  const cols = await themeCollections();
  const all = await figma.variables.getLocalVariablesAsync('COLOR');
  for (const name of Object.keys(EXTRA_VARS)) {
    const spec = EXTRA_VARS[name];
    for (const theme of ['dark', 'light']) {
      const col = cols[theme];
      let v = all.find(x => x.name === name && x.variableCollectionId === col.id);
      if (!v) { v = figma.variables.createVariable(name, col, 'COLOR'); v.scopes = spec.scopes; }
      v.setValueForMode(col.modes[0].modeId, Object.assign(rgb(spec[theme]), { a: 1 }));
      if (theme === 'dark') VARS[name] = v;
    }
  }
}

async function loadContext() {
  for (const k of Object.keys(DARK_VAR_NUM)) VARS[k] = await figma.variables.getVariableByIdAsync('VariableID:2:' + DARK_VAR_NUM[k]);
  await ensureExtraVars();
  const comps = await figma.getNodeByIdAsync(IDS.components);
  CARD = await figma.getNodeByIdAsync(IDS.card);
  AVATAR = await figma.getNodeByIdAsync(IDS.avatar);
  if (!comps || !CARD || !AVATAR) throw new Error('Не найдены компоненты (Components/HabitCard/Avatar)');
  const row = comps.findOne(n => n.name === 'Icons');
  ICON = {};
  comps.findAll(n => n.type === 'COMPONENT' && n.name.indexOf('Icon/') === 0).forEach(c => { ICON[c.name.slice(5)] = c; });
  for (const name of Object.keys(NEW_ICONS)) {
    if (ICON[name]) continue;
    const inner = NEW_ICONS[name].replace(/<(path|circle|rect|line)/g, '<$1 fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"');
    const c = figma.createComponentFromNode(figma.createNodeFromSvg('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>'));
    c.name = 'Icon/' + name; c.fills = []; row.appendChild(c); ICON[name] = c;
  }
}

const solid = (k, op) => figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: op == null ? 1 : op }, 'color', VARS[k]);
const raw = (h, op) => ({ type: 'SOLID', color: rgb(h), opacity: op == null ? 1 : op });
const gradV = (h, a1, a2) => { const c = rgb(h); return { type: 'GRADIENT_LINEAR', gradientTransform: [[0, 1, 0], [-1, 0, 1]], gradientStops: [{ position: 0, color: Object.assign({}, c, { a: a1 }) }, { position: 1, color: Object.assign({}, c, { a: a2 }) }] }; };
const gradDiag = (h1, h2) => ({ type: 'GRADIENT_LINEAR', gradientTransform: [[1, 1, 0], [-1, 1, 0.5]], gradientStops: [{ position: 0, color: Object.assign(rgb(h1), { a: 1 }) }, { position: 1, color: Object.assign(rgb(h2), { a: 1 }) }] });

function AL(dir, o) {
  o = o || {};
  const f = figma.createFrame();
  f.layoutMode = dir === 'V' ? 'VERTICAL' : 'HORIZONTAL';
  f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO';
  f.fills = []; f.clipsContent = false;
  if (o.name) f.name = o.name;
  if (o.gap != null) f.itemSpacing = o.gap;
  if (o.pad != null) {
    const p = Array.isArray(o.pad) ? o.pad : [o.pad, o.pad, o.pad, o.pad];
    f.paddingTop = p[0]; f.paddingRight = p[1]; f.paddingBottom = p[2]; f.paddingLeft = p[3];
  }
  if (o.fill) f.fills = [o.fill];
  if (o.r != null) f.cornerRadius = o.r;
  if (o.align) f.counterAxisAlignItems = o.align;
  if (o.justify) f.primaryAxisAlignItems = o.justify;
  if (o.stroke) { f.strokes = [o.stroke]; f.strokeWeight = o.sw || 1; f.strokeAlign = 'INSIDE'; }
  return f;
}
function add(parent, child, fill) { parent.appendChild(child); if (fill) child.layoutSizingHorizontal = 'FILL'; return child; }
function fixedSize(f, w, h) { f.primaryAxisSizingMode = 'FIXED'; f.counterAxisSizingMode = 'FIXED'; f.resize(w, h); return f; }
function T(s, size, style, paint, o) {
  o = o || {};
  const t = figma.createText();
  t.fontName = { family: 'Inter', style: style }; t.characters = s; t.fontSize = size; t.fills = [paint];
  if (o.ls != null) t.letterSpacing = { unit: 'PERCENT', value: o.ls };
  if (o.lh) t.lineHeight = { unit: 'PIXELS', value: o.lh };
  if (o.center) t.textAlignHorizontal = 'CENTER';
  t.name = o.name || s.slice(0, 32);
  return t;
}
// Append a text that wraps to the parent's width.
function addWrap(parent, t) {
  parent.appendChild(t);
  t.layoutSizingHorizontal = 'FIXED'; t.textAutoResize = 'NONE'; t.resize(100, Math.max(t.height, 16));
  t.textAutoResize = 'HEIGHT'; t.layoutSizingHorizontal = 'FILL';
  return t;
}
function icon(name, size, paint) {
  if (!ICON[name]) throw new Error('Нет иконки ' + name);
  const i = ICON[name].createInstance(); i.resize(size, size);
  i.findAll(n => n.type === 'VECTOR' || n.type === 'ELLIPSE' || n.type === 'RECTANGLE').forEach(v => { if (v.strokes && v.strokes.length) v.strokes = [paint]; });
  return i;
}
function avatar(letter, size, keepStroke) {
  const a = AVATAR.createInstance();
  const c = AVATAR_COLORS[letter] || AVATAR_COLORS['В'];
  a.fills = [gradDiag(c[0], c[1])];
  const l = a.findOne(n => n.name === 'Letter'); l.characters = letter;
  if (size && size !== 28) { a.resize(size, size); a.cornerRadius = size / 2; l.fontSize = Math.round(size * 0.42); }
  if (!keepStroke) a.strokes = [];
  return a;
}
function label(s) { return T(s, 12, 'Semi Bold', solid('text/secondary'), { ls: 4 }); }
function circleBtn(iconName, size, fill, iconPaint, name) {
  const b = AL('H', { name: name || 'Button', r: size / 2, fill: fill, justify: 'CENTER', align: 'CENTER' });
  fixedSize(b, size, size); b.appendChild(icon(iconName, Math.round(size * 0.45), iconPaint)); return b;
}
function seg(items, active, small) {
  const c = AL('H', { name: 'Segmented', gap: 2, pad: 3, r: small ? 10 : 12, fill: solid('bg/surface-2') });
  items.forEach((t, i) => {
    const on = i === active;
    const it = AL('H', { name: 'Seg/' + t, pad: small ? [5, 10, 5, 10] : [8, 8, 8, 8], r: small ? 8 : 9, justify: 'CENTER', align: 'CENTER' });
    if (on) {
      it.fills = [solid('control/selected')];
      it.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.12 }, offset: { x: 0, y: 1 }, radius: 3, spread: 0, visible: true, blendMode: 'NORMAL' }];
    }
    it.appendChild(T(t, small ? 12 : 13, on ? 'Semi Bold' : 'Medium', on ? solid('text/primary') : solid('text/secondary')));
    c.appendChild(it);
    if (!small) it.layoutSizingHorizontal = 'FILL';
  });
  return c;
}
function radio(on, color) {
  const r = AL('H', { name: 'Radio', r: 11, justify: 'CENTER', align: 'CENTER', stroke: on ? raw(color) : solid('text/tertiary'), sw: 2 });
  fixedSize(r, 22, 22);
  if (on) { const d = figma.createEllipse(); d.resize(10, 10); d.fills = [raw(color)]; r.appendChild(d); }
  return r;
}
function toggle(on) {
  const t = AL('H', { name: 'Toggle', pad: 2, r: 16, fill: on ? raw(HABIT.green) : solid('bg/surface-2'), justify: on ? 'MAX' : 'MIN', align: 'CENTER' });
  fixedSize(t, 51, 31);
  const k = figma.createEllipse(); k.resize(27, 27); k.fills = [raw('FFFFFF')];
  k.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.15 }, offset: { x: 0, y: 2 }, radius: 6, spread: 0, visible: true, blendMode: 'NORMAL' }];
  t.appendChild(k); return t;
}
function chip(text, color, iconName) {
  const c = AL('H', { name: 'Chip/' + text, gap: 4, pad: [3, 8, 3, 6], r: 8, fill: raw(color, 0.14), align: 'CENTER' });
  c.appendChild(icon(iconName, 13, raw(color)));
  c.appendChild(T(text, 13, 'Medium', raw(color)));
  return c;
}

function screen(name, x, y) {
  const s = figma.createFrame();
  s.name = name; s.layoutMode = 'VERTICAL';
  s.primaryAxisSizingMode = 'FIXED'; s.counterAxisSizingMode = 'FIXED'; s.resize(390, 844);
  s.x = x; s.y = y;
  s.paddingTop = 56; s.paddingLeft = s.paddingRight = 16; s.paddingBottom = 24; s.itemSpacing = 18;
  s.fills = [solid('bg/base')]; s.clipsContent = true; s.cornerRadius = 44;
  return s;
}
function pill(children, name) {
  const p = AL('H', { name: name, gap: 4, pad: [7, 12, 7, 12], r: 16, fill: solid('bg/surface-2'), align: 'CENTER' });
  children.forEach(c => p.appendChild(c)); return p;
}
function tgBar(mode) {
  const bar = AL('H', { name: 'Telegram Bar', justify: 'SPACE_BETWEEN', align: 'CENTER' });
  const left = mode === 'back'
    ? pill([icon('chevron-left', 16, solid('text/primary')), T('Назад', 14, 'Medium', solid('text/primary'))], 'Back')
    : pill([icon('x', 14, solid('text/primary')), T('Закрыть', 14, 'Medium', solid('text/primary'))], 'Close');
  bar.appendChild(left);
  bar.appendChild(pill([icon('more', 18, solid('text/primary'))], 'More'));
  return bar;
}
function header(title) {
  const h = AL('V', { name: 'Header', gap: 2 });
  h.appendChild(T('СУББОТА, 8 НОЯБРЯ', 13, 'Semi Bold', solid('text/secondary'), { ls: 2, name: 'Date' }));
  h.appendChild(T(title, 32, 'Bold', solid('text/primary'), { ls: -2, lh: 40, name: 'Title' }));
  return h;
}
function tabBar(s, active) {
  const tab = AL('H', { name: 'Tab Bar', justify: 'SPACE_BETWEEN', align: 'CENTER', pad: [0, 10, 0, 10], r: 31, fill: solid('tabbar/bg'), stroke: solid('border/subtle') });
  s.appendChild(tab); tab.layoutPositioning = 'ABSOLUTE'; fixedSize(tab, 300, 62); tab.x = 45; tab.y = 844 - 28 - 62;
  tab.effects = [{ type: 'BACKGROUND_BLUR', blurType: 'NORMAL', radius: 24, visible: true },
    { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.35 }, offset: { x: 0, y: 10 }, radius: 30, spread: 0, visible: true, blendMode: 'NORMAL' }];
  [['home', 'Главная'], ['activity', 'Лента'], ['user', 'Профиль']].forEach(pair => {
    const on = pair[1] === active;
    const it = AL('V', { name: 'Tab/' + pair[1], gap: 2, pad: [6, 18, 6, 18], r: 24, align: 'CENTER', fill: on ? solid('bg/surface-2') : null });
    it.appendChild(icon(pair[0], 22, on ? solid('text/primary') : solid('text/tertiary')));
    it.appendChild(T(pair[1], 10, 'Medium', on ? solid('text/primary') : solid('text/tertiary')));
    tab.appendChild(it);
  });
  return tab;
}
function scrollFade(s, tab, hex) {
  const f = figma.createRectangle(); f.name = 'Scroll Fade';
  s.insertChild(s.children.indexOf(tab), f);
  f.layoutPositioning = 'ABSOLUTE'; f.resize(s.width, 130); f.x = 0; f.y = s.height - 130;
  const c = rgb(hex || '0A0A0B');
  f.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0, 1, 0], [-1, 0, 1]], gradientStops: [
    { position: 0, color: Object.assign({}, c, { a: 0 }) }, { position: 0.55, color: Object.assign({}, c, { a: 0.85 }) }, { position: 1, color: Object.assign({}, c, { a: 1 }) }] }];
}
function tint(node, paint) { node.findAll(n => n.type === 'VECTOR').forEach(v => { v.strokes = [paint]; }); }
function styleCard(inst, o) {
  const c = o.color;
  inst.fills = [solid('bg/surface'), gradV(c, 0.04, 0.26)];
  const q = n => inst.findOne(x => x.name === n);
  const t = q('Title'); t.characters = o.title; t.fills = [raw(c)];
  q('Subtitle').characters = o.sub;
  q('Avatar A').visible = o.av.indexOf('A') >= 0;
  q('Avatar B').visible = o.av.indexOf('B') >= 0;
  q('Avatars').visible = o.av.length > 0;
  const chk = q('Check');
  if (o.done) { chk.fills = [raw(c)]; chk.strokes = []; tint(q('CheckIcon'), raw('0A0A0B')); }
  else { chk.strokes = [solid('text/secondary')]; chk.strokeWeight = 1.5; tint(q('CheckIcon'), raw('EBEBF5', 0.75)); }
  const days = q('Week').children;
  o.week.forEach((d, i) => { days[i].fills = [d === 1 ? raw(c) : raw(c, i > 5 ? 0.08 : 0.18)]; days[i].strokes = []; });
  if (o.week[5] === 0) { days[5].strokes = [raw(c, 0.9)]; days[5].strokeWeight = 1.5; days[5].strokeAlign = 'INSIDE'; }
  if (o.streak) q('StreakCount').characters = String(o.streak); else q('Streak').visible = false;
  const ico = q('Icon'); ico.swapComponent(ICON[o.icon]); tint(ico, raw(c));
}

// ---------- Screens (iOS, dark) ----------
function buildDetail(x, y) {
  const s = screen('Привычка — Dark', x, y); s.itemSpacing = 20;
  add(s, tgBar('back'), true);
  const h = AL('H', { name: 'Habit Header', gap: 14, align: 'CENTER' }); add(s, h, true);
  const badge = AL('H', { name: 'Icon Badge', r: 18, fill: raw(HABIT.mint, 0.16), justify: 'CENTER', align: 'CENTER' });
  fixedSize(badge, 56, 56); badge.appendChild(icon('dumbbell', 28, raw(HABIT.mint))); h.appendChild(badge);
  const titles = AL('V', { name: 'Titles', gap: 2 }); add(h, titles, true);
  titles.appendChild(T('Зал вместе', 26, 'Bold', raw(HABIT.mint), { ls: -2, lh: 32 }));
  titles.appendChild(T('3 раза в неделю · все участники', 15, 'Regular', solid('text/secondary')));
  h.appendChild(circleBtn('pencil', 36, solid('bg/surface-2'), solid('text/primary'), 'Edit'));

  const stats = AL('H', { name: 'Stats', gap: 10 }); add(s, stats, true);
  [['12', 'Серия, нед.', true], ['34', 'Всего раз', false], ['86%', 'Выполнено', false]].forEach(v => {
    const c = AL('V', { name: 'Stat/' + v[1], gap: 2, pad: 14, r: 20, fill: solid('bg/surface'), stroke: solid('border/subtle') });
    add(stats, c, true);
    const row = AL('H', { gap: 4, align: 'CENTER' }); c.appendChild(row);
    row.appendChild(T(v[0], 24, 'Bold', solid('text/primary'), { ls: -2 }));
    if (v[2]) row.appendChild(icon('flame', 16, raw(HABIT.mint)));
    c.appendChild(T(v[1], 13, 'Medium', solid('text/secondary')));
  });

  const hm = AL('V', { name: 'Heatmap', gap: 10, pad: 16, r: 24, fill: solid('bg/surface'), stroke: solid('border/subtle') }); add(s, hm, true);
  const hr = AL('H', { justify: 'SPACE_BETWEEN', align: 'CENTER', name: 'Heatmap Header' }); add(hm, hr, true);
  hr.appendChild(T('История', 17, 'Semi Bold', solid('text/primary')));
  hr.appendChild(seg(['Месяц', 'Полгода', 'Год'], 1, true));
  const months = AL('H', { name: 'Months', justify: 'SPACE_BETWEEN' }); add(hm, months, true);
  ['Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя'].forEach(m => months.appendChild(T(m, 11, 'Medium', solid('text/tertiary'))));
  const grid = AL('H', { name: 'Grid', gap: 3 }); add(hm, grid, true);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let c = 0; c < 26; c++) {
    const col = AL('V', { gap: 3, name: 'Week ' + (c + 1) }); add(grid, col, true);
    for (let r = 0; r < 7; r++) {
      const cell = figma.createRectangle(); cell.resize(10, 10); cell.cornerRadius = 2.5; cell.name = 'Day';
      const future = c === 25 && r > 5;
      const planned = r === 0 || r === 2 || r === 4;
      const done = !future && (planned ? rnd() < 0.8 : rnd() < 0.12);
      cell.fills = [future ? raw(HABIT.mint, 0.05) : done ? raw(HABIT.mint) : raw(HABIT.mint, 0.12)];
      add(col, cell, true);
    }
  }
  const legend = AL('H', { name: 'Legend', justify: 'SPACE_BETWEEN', align: 'CENTER' }); add(hm, legend, true);
  legend.appendChild(T('34 тренировки за полгода', 13, 'Regular', solid('text/secondary')));
  legend.appendChild(T('Лучшая серия: 9 нед.', 13, 'Medium', raw(HABIT.mint)));

  const pc = AL('V', { name: 'Participants', pad: [4, 16, 4, 16], r: 24, fill: solid('bg/surface'), stroke: solid('border/subtle') }); add(s, pc, true);
  [['В', 'Влад (ты)', 'Сегодня отмечено', [1, 0, 1, 0, 0, 1, 0]], ['М', 'Маша', 'Ещё не отметила сегодня', [1, 0, 1, 0, 0, 0, 0]]].forEach(p => {
    const row = AL('H', { name: 'Member/' + p[1], gap: 12, pad: [12, 0, 12, 0], align: 'CENTER' }); add(pc, row, true);
    row.strokes = [solid('border/subtle')]; row.strokeTopWeight = 0; row.strokeLeftWeight = 0; row.strokeRightWeight = 0; row.strokeBottomWeight = 1; row.strokeAlign = 'INSIDE';
    row.appendChild(avatar(p[0], 40));
    const col = AL('V', { gap: 2 }); add(row, col, true);
    col.appendChild(T(p[1], 15, 'Semi Bold', solid('text/primary')));
    col.appendChild(T(p[2], 13, 'Regular', solid('text/secondary')));
    const dots = AL('H', { gap: 3, name: 'Mini Week' }); row.appendChild(dots);
    p[3].forEach((d, i) => { const e = figma.createEllipse(); e.resize(7, 7); e.fills = [d ? raw(HABIT.mint) : raw(HABIT.mint, i > 5 ? 0.08 : 0.2)]; dots.appendChild(e); });
  });
  const inv = AL('H', { name: 'Invite Row', gap: 10, pad: [14, 0, 14, 0], align: 'CENTER' }); add(pc, inv, true);
  inv.appendChild(icon('send', 18, raw(HABIT.mint)));
  inv.appendChild(T('Позвать ещё друга', 15, 'Medium', raw(HABIT.mint)));

  const rem = AL('H', { name: 'Reminder', gap: 12, pad: [14, 16, 14, 16], r: 20, fill: solid('bg/surface'), stroke: solid('border/subtle'), align: 'CENTER' }); add(s, rem, true);
  rem.appendChild(icon('bell', 20, solid('text/secondary')));
  const rc = AL('V', { gap: 2 }); add(rem, rc, true);
  rc.appendChild(T('Напоминание', 15, 'Semi Bold', solid('text/primary')));
  rc.appendChild(T('18:00–21:00 · Пн, Ср, Пт', 13, 'Regular', solid('text/secondary')));
  rem.appendChild(icon('chevron-right', 18, solid('text/tertiary')));
  return s;
}

function buildSheet(x, y) {
  const root = figma.createFrame(); root.name = 'Новая привычка — Dark';
  root.resize(390, 844); root.x = x; root.y = y; root.cornerRadius = 44; root.clipsContent = true; root.fills = [solid('bg/base')];
  const ghost = AL('V', { name: 'Behind', gap: 12, pad: [56, 16, 0, 16] }); root.appendChild(ghost); fixedSize(ghost, 390, 844);
  ghost.appendChild(T('Наши привычки', 32, 'Bold', solid('text/primary'), { ls: -2 }));
  const dim = figma.createRectangle(); dim.name = 'Dim'; dim.resize(390, 844); dim.fills = [raw('000000', 0.6)]; root.appendChild(dim);
  dim.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };

  const sh = AL('V', { name: 'Sheet', gap: 16, pad: [8, 16, SHEET_BOTTOM_PAD, 16], fill: solid('bg/surface') });
  root.appendChild(sh); fixedSize(sh, 390, 790); sh.x = 0; sh.y = SHEET_TOP;
  sh.topLeftRadius = 28; sh.topRightRadius = 28; sh.clipsContent = true;
  sh.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };
  const gr = AL('H', { name: 'Grabber', justify: 'CENTER' }); add(sh, gr, true);
  const g = figma.createRectangle(); g.resize(36, 5); g.cornerRadius = 3; g.fills = [solid('text/tertiary')]; gr.appendChild(g);
  const top = AL('H', { name: 'Sheet Header', justify: 'SPACE_BETWEEN', align: 'CENTER' }); add(sh, top, true);
  top.appendChild(T('Отмена', 16, 'Regular', solid('text/secondary')));
  top.appendChild(T('Новая привычка', 17, 'Semi Bold', solid('text/primary')));
  top.appendChild(T('Создать', 16, 'Semi Bold', raw(HABIT.coral)));

  const prev = CARD.createInstance(); prev.name = 'Preview'; add(sh, prev, true); prev.resize(358, 128); prev.layoutSizingHorizontal = 'FILL';
  styleCard(prev, { color: HABIT.coral, title: 'Бегать по утрам', sub: 'Пн, Ср, Пт · все участники', icon: 'zap', av: ['A', 'B'], done: false, week: [0, 0, 0, 0, 0, 0, 0], streak: 0 });

  const field = AL('H', { name: 'Name Field', pad: [14, 16, 14, 16], r: 14, fill: solid('bg/surface-2'), align: 'CENTER', gap: 2 }); add(sh, field, true);
  field.appendChild(T('Бегать по утрам', 16, 'Regular', solid('text/primary')));
  const caret = figma.createRectangle(); caret.resize(2, 20); caret.fills = [raw(HABIT.coral)]; field.appendChild(caret);

  const g1 = AL('V', { name: 'Icon Picker', gap: 8 }); add(sh, g1, true); g1.appendChild(label('ИКОНКА'));
  const icons = AL('H', { name: 'Icons', justify: 'SPACE_BETWEEN' }); add(g1, icons, true);
  ['zap', 'dumbbell', 'book', 'heart', 'droplet', 'moon', 'sun'].forEach((n, i) => {
    const on = i === 0;
    const b = circleBtn(n, 42, on ? raw(HABIT.coral, 0.18) : solid('bg/surface-2'), on ? raw(HABIT.coral) : solid('text/secondary'), 'Icon/' + n);
    if (on) { b.strokes = [raw(HABIT.coral)]; b.strokeWeight = 1.5; b.strokeAlign = 'INSIDE'; }
    icons.appendChild(b);
  });

  const g2 = AL('V', { name: 'Color Picker', gap: 8 }); add(sh, g2, true); g2.appendChild(label('ЦВЕТ'));
  const colors = AL('H', { name: 'Colors', justify: 'SPACE_BETWEEN', align: 'CENTER' }); add(g2, colors, true);
  ['coral', 'mint', 'lavender', 'pink', 'sky', 'green', 'peach', 'gold'].forEach(k => {
    const ring = AL('H', { name: 'Color/' + k, r: 19, justify: 'CENTER', align: 'CENTER' }); fixedSize(ring, 38, 38);
    if (k === 'coral') { ring.strokes = [raw(HABIT[k])]; ring.strokeWeight = 2; ring.strokeAlign = 'INSIDE'; }
    const dot = figma.createEllipse(); dot.resize(28, 28); dot.fills = [raw(HABIT[k])]; ring.appendChild(dot);
    colors.appendChild(ring);
  });

  const g3 = AL('V', { name: 'Frequency', gap: 8 }); add(sh, g3, true); g3.appendChild(label('ЧАСТОТА'));
  add(g3, seg(['Каждый день', 'N раз в нед.', 'Дни недели'], 2), true);
  const days = AL('H', { name: 'Weekdays', gap: 6 }); add(g3, days, true);
  ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach((d, i) => {
    const on = i === 0 || i === 2 || i === 4;
    const c = AL('H', { name: 'Day/' + d, pad: [9, 0, 9, 0], r: 10, justify: 'CENTER', fill: on ? raw(HABIT.coral, 0.18) : solid('bg/surface-2') });
    c.appendChild(T(d, 13, 'Semi Bold', on ? raw(HABIT.coral) : solid('text/secondary')));
    add(days, c, true);
  });

  const g4 = AL('V', { name: 'Members', gap: 8 }); add(sh, g4, true); g4.appendChild(label('УЧАСТНИКИ'));
  const mr = AL('H', { name: 'Member Row', justify: 'SPACE_BETWEEN', align: 'CENTER' }); add(g4, mr, true);
  const people = AL('H', { name: 'People', gap: 8, align: 'CENTER' }); mr.appendChild(people);
  people.appendChild(avatar('В', 34)); people.appendChild(avatar('М', 34));
  const plus = circleBtn('plus', 34, null, solid('text/secondary'), 'Add Member');
  plus.strokes = [solid('text/tertiary')]; plus.strokeWeight = 1.5; plus.dashPattern = [3, 3]; plus.strokeAlign = 'INSIDE'; people.appendChild(plus);

  // When does a shared day count: two explained options instead of a bare All/Any switch.
  const g4b = AL('V', { name: 'Completion Mode', gap: 8 }); add(sh, g4b, true); g4b.appendChild(label('КОГДА ДЕНЬ ЗАСЧИТАН'));
  [
    { title: 'Когда отметятся все', desc: 'Делаем вместе: если кто-то пропустит, серия сгорит у всех', eg: 'Например: зал, чтение, бег', on: true },
    { title: 'Когда отметится любой', desc: 'Общее дело: достаточно, чтобы отметился один из вас', eg: 'Например: полить цветы, выгулять собаку', on: false },
  ].forEach(o => {
    const card = AL('H', { name: 'Mode/' + o.title, gap: 12, pad: [12, 14, 12, 14], r: 14, fill: o.on ? raw(HABIT.coral, 0.10) : solid('bg/surface-2'), stroke: o.on ? raw(HABIT.coral) : null, sw: 1.5 });
    add(g4b, card, true);
    card.appendChild(radio(o.on, HABIT.coral));
    const col = AL('V', { name: 'Text', gap: 3 }); add(card, col, true);
    col.appendChild(T(o.title, 15, 'Semi Bold', solid('text/primary')));
    addWrap(col, T(o.desc, 13, 'Regular', solid('text/secondary'), { lh: 18 }));
    addWrap(col, T(o.eg, 13, 'Regular', solid('text/tertiary'), { lh: 18 }));
  });

  const g5 = AL('V', { name: 'Reminder', gap: 8 }); add(sh, g5, true); g5.appendChild(label('НАПОМИНАНИЕ'));
  add(g5, seg(['Точное время', 'Промежуток', 'Выкл'], 0), true);
  const tr = AL('H', { name: 'Time Row', justify: 'SPACE_BETWEEN', align: 'CENTER', pad: [12, 16, 12, 16], r: 14, fill: solid('bg/surface-2') }); add(g5, tr, true);
  tr.appendChild(T('Напомнить в', 16, 'Regular', solid('text/primary')));
  tr.appendChild(T('07:30', 16, 'Semi Bold', raw(HABIT.coral)));

  // Long frame: the sheet scrolls in the app, so the mockup shows all of it at once.
  // Switching to hug height can move the frame, so its position is set again afterwards.
  sh.primaryAxisSizingMode = 'AUTO';
  const sheetHeight = sh.height;
  sh.primaryAxisSizingMode = 'FIXED';
  sh.constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
  root.resize(390, Math.max(844, SHEET_TOP + sheetHeight));
  sh.resize(390, sheetHeight); sh.x = 0; sh.y = SHEET_TOP;
  sh.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };
  return root;
}

function feedRow(p, last) {
  const row = AL('H', { name: 'Event/' + p.name, gap: 12, pad: [12, 0, 12, 0] }); row.counterAxisAlignItems = 'MIN';
  if (!last) { row.strokes = [solid('border/subtle')]; row.strokeTopWeight = 0; row.strokeLeftWeight = 0; row.strokeRightWeight = 0; row.strokeBottomWeight = 1; row.strokeAlign = 'INSIDE'; }
  row.appendChild(avatar(p.letter, 40));
  const col = AL('V', { gap: 4, name: 'Text' });
  return { row: row, col: col, after: parent => {
    add(parent, row, true); add(row, col, true);
    const l1 = AL('H', { gap: 6, align: 'CENTER', justify: 'SPACE_BETWEEN' }); add(col, l1, true);
    l1.appendChild(T(p.name, 15, 'Semi Bold', solid('text/primary')));
    l1.appendChild(T(p.time, 13, 'Regular', solid('text/tertiary')));
    col.appendChild(T(p.action, 14, 'Regular', solid('text/secondary')));
    if (p.habit) col.appendChild(chip(p.habit, HABIT[p.color], p.icon));
  } };
}
function buildFeed(x, y) {
  const s = screen('Лента — Dark', x, y); s.itemSpacing = 16;
  add(s, tgBar('close'), true);
  add(s, header('Лента'), true);
  const groups = [
    ['СЕГОДНЯ', [
      { letter: 'М', name: 'Маша', action: 'отметила привычку', habit: 'Комплименты', color: 'pink', icon: 'heart', time: '19:59' },
      { letter: 'В', name: 'Влад', action: 'серия 23 дня подряд', habit: 'Читать 20 минут', color: 'lavender', icon: 'book', time: '14:42' },
      { letter: 'Д', name: 'Дима', action: 'присоединился к привычке', habit: 'Зал вместе', color: 'mint', icon: 'dumbbell', time: '12:10' }]],
    ['ВЧЕРА', [
      { letter: 'М', name: 'Маша', action: 'отметила за 6 ноября', habit: 'Пить воду', color: 'sky', icon: 'droplet', time: '23:10' },
      { letter: 'А', name: 'Аня', action: 'теперь в друзьях у Влада', habit: null, time: '18:02' }]],
  ];
  groups.forEach(gr => {
    const g = AL('V', { name: 'Group/' + gr[0], gap: 8 }); add(s, g, true);
    g.appendChild(label(gr[0]));
    const card = AL('V', { name: 'Events', pad: [0, 16, 0, 16], r: 24, fill: solid('bg/surface'), stroke: solid('border/subtle') }); add(g, card, true);
    gr[1].forEach((p, i) => feedRow(p, i === gr[1].length - 1).after(card));
  });
  const tab = tabBar(s, 'Лента'); scrollFade(s, tab);
  return s;
}

function settingsRow(lead, title, value, opts) {
  opts = opts || {};
  const row = AL('H', { name: 'Row/' + title, gap: 12, pad: [11, 14, 11, 14], align: 'CENTER' });
  return { after: (parent, last) => {
    add(parent, row, true);
    if (!last) { row.strokes = [solid('border/subtle')]; row.strokeTopWeight = 0; row.strokeLeftWeight = 0; row.strokeRightWeight = 0; row.strokeBottomWeight = 1; row.strokeAlign = 'INSIDE'; }
    row.appendChild(lead);
    const t = T(title, 16, 'Regular', opts.accent ? raw(opts.accent) : solid('text/primary')); add(row, t, true);
    if (opts.toggle != null) { row.appendChild(toggle(opts.toggle)); return; }
    if (value) row.appendChild(T(value, 15, 'Regular', solid('text/secondary')));
    if (!opts.noChevron) row.appendChild(icon('chevron-right', 16, solid('text/tertiary')));
  } };
}
function tile(iconName, color) {
  const t = AL('H', { name: 'Tile', r: 8, fill: raw(color), justify: 'CENTER', align: 'CENTER' }); fixedSize(t, 30, 30);
  t.appendChild(icon(iconName, 17, raw('0A0A0B'))); return t;
}
function group(s, title, rows) {
  const g = AL('V', { name: 'Group/' + (title || 'misc'), gap: 8 }); add(s, g, true);
  if (title) g.appendChild(label(title));
  const card = AL('V', { name: 'Card', r: 20, fill: solid('bg/surface'), stroke: solid('border/subtle') }); add(g, card, true);
  rows.forEach((r, i) => r.after(card, i === rows.length - 1));
}
function buildProfile(x, y) {
  const s = screen('Профиль — Dark', x, y); s.itemSpacing = 16;
  add(s, tgBar('close'), true);
  const head = AL('V', { name: 'Profile Head', gap: 6, align: 'CENTER' }); add(s, head, true);
  head.appendChild(avatar('В', 72));
  head.appendChild(T('Влад', 22, 'Bold', solid('text/primary'), { ls: -1 }));
  head.appendChild(T('5 привычек · 3 друга · лучшая серия 23 дня', 14, 'Regular', solid('text/secondary')));
  group(s, 'ДРУЗЬЯ', [
    settingsRow(avatar('М', 30), 'Маша', '4 общие'),
    settingsRow(avatar('Д', 30), 'Дима', '1 общая'),
    settingsRow(circleBtn('send', 30, raw(HABIT.mint, 0.16), raw(HABIT.mint), 'Invite'), 'Пригласить друга', null, { accent: HABIT.mint, noChevron: true }),
  ]);
  group(s, 'НАСТРОЙКИ', [
    settingsRow(tile('contrast', HABIT.lavender), 'Тема', 'Как в Telegram'),
    settingsRow(tile('globe', HABIT.sky), 'Язык', 'Как в Telegram'),
    settingsRow(tile('clock', HABIT.peach), 'Часовой пояс', 'Москва'),
    settingsRow(tile('bell', HABIT.coral), 'Напоминания', null, { toggle: true }),
    settingsRow(tile('calendar', HABIT.green), 'Итоги недели', 'Вс, 20:00'),
  ]);
  group(s, null, [settingsRow(tile('archive', HABIT.gold), 'Архив привычек', '3')]);
  const tab = tabBar(s, 'Профиль'); scrollFade(s, tab);
  return s;
}

function buildInvite(x, y) {
  const s = screen('Инвайт — Dark', x, y); s.itemSpacing = 0; s.paddingBottom = 40;
  add(s, tgBar('back'), true);
  const hero = figma.createFrame(); hero.name = 'Hero'; hero.fills = []; hero.clipsContent = false;
  s.appendChild(hero); hero.resize(358, 380); hero.layoutSizingHorizontal = 'FILL';
  const glow = figma.createEllipse(); glow.name = 'Glow'; glow.resize(260, 260); glow.x = 49; glow.y = 60; glow.fills = [raw(HABIT.mint, 0.25)];
  glow.effects = [{ type: 'LAYER_BLUR', blurType: 'NORMAL', radius: 70, visible: true }]; hero.appendChild(glow);
  const big = figma.createEllipse(); big.name = 'Circle'; big.resize(180, 180); big.x = 89; big.y = 100;
  big.fills = [solid('bg/surface-2')]; big.strokes = [solid('border/subtle')]; big.strokeWeight = 1; hero.appendChild(big);
  const ic = icon('dumbbell', 72, solid('text/primary')); hero.appendChild(ic); ic.x = 89 + 54; ic.y = 100 + 54;
  ic.findAll(n => n.type === 'VECTOR').forEach(v => { v.strokeWeight = 5; });
  const a1 = avatar('М', 84, true); hero.appendChild(a1); a1.x = 224; a1.y = 70;
  const a2 = avatar('В', 72, true); hero.appendChild(a2); a2.x = 234; a2.y = 245;
  const txt = AL('V', { name: 'Copy', gap: 8, align: 'CENTER' }); add(s, txt, true);
  txt.appendChild(T('СТРОИМ СЕБЯ ВМЕСТЕ', 13, 'Semi Bold', solid('text/secondary'), { ls: 6, center: true }));
  addWrap(txt, T('Становитесь лучше вместе', 24, 'Bold', solid('text/primary'), { ls: -2, center: true }));
  txt.appendChild(T('Зал вместе', 24, 'Bold', raw(HABIT.mint), { ls: -2, center: true }));
  const sub = T('Каждый отмечает сам. День засчитается, когда отметят все участники.', 15, 'Regular', solid('text/secondary'), { center: true, lh: 21 });
  addWrap(txt, sub);
  const spacer = figma.createFrame(); spacer.name = 'Spacer'; spacer.fills = []; s.appendChild(spacer); spacer.layoutSizingHorizontal = 'FILL'; spacer.layoutGrow = 1;
  const btns = AL('V', { name: 'Actions', gap: 10 }); add(s, btns, true);
  const primary = AL('H', { name: 'Primary', gap: 8, pad: 16, r: 16, fill: solid('text/primary'), justify: 'CENTER', align: 'CENTER' }); add(btns, primary, true);
  primary.appendChild(icon('send', 18, solid('bg/base')));
  primary.appendChild(T('Отправить приглашение', 16, 'Semi Bold', solid('bg/base')));
  const second = AL('H', { name: 'Secondary', gap: 8, pad: 16, r: 16, fill: solid('bg/surface-2'), justify: 'CENTER', align: 'CENTER' }); add(btns, second, true);
  second.appendChild(icon('link', 18, solid('text/primary')));
  second.appendChild(T('Скопировать ссылку', 16, 'Semi Bold', solid('text/primary')));
  return s;
}

// ---------- Variants: light theme + Android ----------
// Map every Theme / Dark variable id to the Theme / Light variable with the same name.
async function lightVarMap() {
  const cols = await themeCollections();
  const all = await figma.variables.getLocalVariablesAsync('COLOR');
  const lightByName = {};
  all.filter(v => v.variableCollectionId === cols.light.id).forEach(v => { lightByName[v.name] = v; });
  const map = {};
  all.filter(v => v.variableCollectionId === cols.dark.id).forEach(v => { if (lightByName[v.name]) map[v.id] = lightByName[v.name]; });
  return map;
}
async function makeLight(src, name, x, y) {
  const vmap = await lightVarMap();
  const L = src.clone(); L.name = name; L.x = x; L.y = y;
  const remap = paints => {
    let did = false;
    const out = paints.map(p => {
      if (p.type === 'SOLID') {
        const bv = p.boundVariables && p.boundVariables.color;
        if (bv && vmap[bv.id]) { did = true; return figma.variables.setBoundVariableForPaint(p, 'color', vmap[bv.id]); }
        const h = HUE_MAP[toHex(p.color)];
        if (h) { did = true; return Object.assign({}, p, { color: rgb(h) }); }
        if (toHex(p.color) === '000000' && p.opacity > 0.4) { did = true; return Object.assign({}, p, { opacity: 0.35 }); }
        return p;
      }
      if (p.type === 'GRADIENT_LINEAR') {
        did = true;
        return Object.assign({}, p, { gradientStops: p.gradientStops.map(s => {
          const h = HUE_MAP[toHex(s.color)];
          return (s.color.a < 1 && h) ? Object.assign({}, s, { color: Object.assign(rgb(h), { a: s.color.a * 0.55 }) }) : s;
        }) });
      }
      return p;
    });
    return did ? out : null;
  };
  const walk = n => {
    if (n.name === 'Scroll Fade') {
      const c = rgb(LIGHT_BG);
      n.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0, 1, 0], [-1, 0, 1]], gradientStops: [
        { position: 0, color: Object.assign({}, c, { a: 0 }) }, { position: 0.55, color: Object.assign({}, c, { a: 0.85 }) }, { position: 1, color: Object.assign({}, c, { a: 1 }) }] }];
      return;
    }
    if ('fills' in n && Array.isArray(n.fills) && n.fills.length) { const r = remap(n.fills); if (r) n.fills = r; }
    if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.length) { const r = remap(n.strokes); if (r) n.strokes = r; }
    if ('children' in n) n.children.forEach(walk);
  };
  walk(L);
  L.findAll(n => n.name === 'Tab Bar').forEach(tab => {
    tab.effects = tab.effects.map(e => e.type === 'DROP_SHADOW' ? Object.assign({}, e, { color: { r: 0.1, g: 0.1, b: 0.2, a: 0.10 }, radius: 24 }) : e);
  });
  return L;
}

async function makeAndroid(src, name, x, y) {
  const robotoMap = { 'Bold': 'Bold', 'Semi Bold': 'SemiBold', 'Medium': 'Medium', 'Regular': 'Regular' };
  const a = src.clone(); a.name = name; a.x = x; a.y = y;
  const H = a.height - 44;
  a.resize(360, H); a.cornerRadius = 28;
  if (a.layoutMode === 'VERTICAL') a.paddingTop = Math.max(0, a.paddingTop - 20);
  const walk = n => {
    if (n.type === 'TEXT' && n.fontName !== figma.mixed && n.fontName.family === 'Inter') {
      n.fontName = { family: 'Roboto', style: robotoMap[n.fontName.style] || 'Regular' };
      if (n.fontSize >= 30) n.fontSize = n.fontSize - 4;
    }
    if ('children' in n) n.children.forEach(walk);
  };
  walk(a);
  a.findAll(n => n.name === 'More' && n.type === 'FRAME').forEach(more => {
    const old = more.children[0]; const dots = icon('more-vertical', 18, solid('text/primary')); more.insertChild(0, dots); old.remove();
  });
  // Android status bar
  const sb = AL('H', { name: 'Android Status Bar', justify: 'SPACE_BETWEEN', align: 'CENTER', pad: [0, 20, 0, 20] });
  a.appendChild(sb);
  if (a.layoutMode !== 'NONE') sb.layoutPositioning = 'ABSOLUTE';
  fixedSize(sb, 360, 28); sb.x = 0; sb.y = 0;
  const time = T('12:30', 13, 'Medium', solid('text/primary')); time.fontName = { family: 'Roboto', style: 'Medium' }; sb.appendChild(time);
  const ind = AL('H', { name: 'Indicators', gap: 6, align: 'CENTER' }); sb.appendChild(ind);
  ind.appendChild(icon('wifi', 15, solid('text/primary'))); ind.appendChild(icon('battery', 18, solid('text/primary')));
  // Tab bar, fade, gesture handle
  a.findAll(n => n.name === 'Tab Bar').forEach(tab => { tab.x = 30; tab.y = H - 24 - 62 - 6; });
  a.findAll(n => n.name === 'Scroll Fade').forEach(f => { f.resize(360, 140); f.x = 0; f.y = H - 140; });
  const gh = figma.createRectangle(); gh.name = 'Gesture Handle'; a.appendChild(gh);
  if (a.layoutMode !== 'NONE') gh.layoutPositioning = 'ABSOLUTE';
  gh.resize(108, 4); gh.cornerRadius = 2; gh.x = (360 - 108) / 2; gh.y = H - 12; gh.fills = [solid('text/secondary')];
  // Invite hero: re-center decorative group for the narrower width
  a.findAll(n => n.name === 'Hero').forEach(h => h.children.forEach(c => { c.x = c.x - 15; }));
  return a;
}

// ---------- Steps ----------
function removeByName(name) {
  figma.currentPage.findAll(n => n.name === name && n.parent === figma.currentPage).forEach(n => n.remove());
}
const BUILDERS = { detail: buildDetail, sheet: buildSheet, feed: buildFeed, profile: buildProfile, invite: buildInvite };

async function buildAll() {
  const made = [];
  for (const sc of SCREENS) {
    const names = {
      iosDark: sc.title + ' — Dark', iosLight: sc.title + ' — Light',
      andDark: 'Android / ' + sc.title + ' — Dark', andLight: 'Android / ' + sc.title + ' — Light',
    };
    Object.keys(names).forEach(k => removeByName(names[k]));
    let stage = 'iOS dark';
    try {
      const d = BUILDERS[sc.key](COL.iosDark, sc.y);
      stage = 'iOS light'; const l = await makeLight(d, names.iosLight, COL.iosLight, sc.y);
      stage = 'Android dark'; const ad = await makeAndroid(d, names.andDark, COL.andDark, sc.y);
      stage = 'Android light'; const al = await makeLight(ad, names.andLight, COL.andLight, sc.y);
      made.push(d, l, ad, al);
    } catch (e) {
      throw new Error(sc.title + ' / ' + stage + ': ' + (e && e.message ? e.message : e));
    }
  }
  figma.viewport.scrollAndZoomIntoView(made);
  return 'Готово: ' + made.length + ' экранов (' + SCREENS.map(s => s.title).join(', ') + ')';
}

// Zoom the viewport to one row of screens so it can be reviewed.
async function focusRow(title) {
  const nodes = figma.currentPage.children.filter(n => n.name === title + ' — Dark' || n.name === title + ' — Light' || n.name === 'Android / ' + title + ' — Dark' || n.name === 'Android / ' + title + ' — Light');
  if (!nodes.length) throw new Error('Нет экранов ' + title);
  figma.viewport.scrollAndZoomIntoView(nodes);
  return 'Показан ряд «' + title + '»';
}

// Write every theme variable (dark and light) as text on the canvas so the web app can copy the tokens.
async function dumpTokens() {
  removeByName('Tokens dump');
  const cols = await themeCollections();
  const all = await figma.variables.getLocalVariablesAsync('COLOR');
  const hex = v => {
    const val = v.valuesByMode[Object.keys(v.valuesByMode)[0]];
    if (!val || val.r == null) return JSON.stringify(val);
    const a = val.a == null ? 1 : val.a;
    return '#' + toHex(val) + (a < 1 ? ' a=' + a.toFixed(2) : '');
  };
  const byName = {};
  all.forEach(v => {
    const theme = v.variableCollectionId === cols.dark.id ? 'dark' : v.variableCollectionId === cols.light.id ? 'light' : null;
    if (!theme) return;
    byName[v.name] = byName[v.name] || {};
    byName[v.name][theme] = hex(v);
  });
  const lines = Object.keys(byName).sort().map(n => n + '   dark ' + (byName[n].dark || '-') + '   light ' + (byName[n].light || '-'));
  const t = T(lines.join('\n'), 28, 'Regular', raw('000000'), { name: 'Tokens dump' });
  t.x = -2400; t.y = 0;
  figma.currentPage.appendChild(t);
  figma.viewport.scrollAndZoomIntoView([t]);
  return 'Токены: ' + lines.length;
}
const STEPS = { all: buildAll, tokens: dumpTokens, 'tokens-clean': async () => { removeByName('Tokens dump'); return 'Убрано'; } };
if (STEP.indexOf('focus:') === 0) STEPS[STEP] = () => focusRow(STEP.slice(6));
// Zoom to any top-level node by name, e.g. 'node:Motion & Interaction'.
if (STEP.indexOf('node:') === 0) STEPS[STEP] = async () => {
  const n = figma.currentPage.children.find(c => c.name.indexOf(STEP.slice(5)) === 0);
  if (!n) throw new Error('Нет узла ' + STEP.slice(5));
  figma.viewport.scrollAndZoomIntoView([n]);
  return 'Показан «' + n.name + '»';
};

(async () => {
  try {
    await loadFonts();
    await loadContext();
    const msg = await STEPS[STEP]();
    figma.closePlugin('✅ ' + msg);
  } catch (e) {
    figma.closePlugin('❌ Habit Builder: ' + (e && e.message ? e.message : String(e)));
  }
})();
