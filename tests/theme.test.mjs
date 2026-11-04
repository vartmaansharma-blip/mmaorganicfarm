import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { THEME_STORAGE_KEY, getServerTheme, getTheme, setTheme, subscribeToTheme } from '../lib/theme.ts';

function makeRoot() { const classes = new Set(); return { dataset: {}, style: {}, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) } }; }

const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const bootstrap = layout.match(/__html: `([^`]+)`/)[1];

test('first visits use light before paint regardless of OS preference', () => {
  for (const darkOS of [false, true]) {
    const root = makeRoot();
    vm.runInNewContext(bootstrap, { document: { documentElement: root }, localStorage: { getItem: () => null }, matchMedia: () => ({ matches: darkOS }) });
    assert.equal(root.dataset.theme, 'light');
    assert.equal(root.style.colorScheme, 'light');
    assert.ok(root.classList.contains('light'));
    assert.equal(root.classList.contains('dark'), false);
  }
  assert.equal(getServerTheme(), 'light');
  assert.match(layout, /data-theme="light"/);
});

test('saved dark choice applies before hydration and blocked storage falls back to light', () => {
  for (const blocked of [false, true]) {
    const root = makeRoot();
    vm.runInNewContext(bootstrap, { document: { documentElement: root }, localStorage: { getItem: () => { if (blocked) throw Error('blocked'); return 'dark'; } } });
    assert.equal(root.dataset.theme, blocked ? 'light' : 'dark');
  }
});

test('explicit selection persists, broadcasts once and synchronizes other tabs without reload', () => {
  const previous = Object.fromEntries(['window', 'document', 'localStorage'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const events = new EventTarget();
  const root = makeRoot();
  const saved = new Map();
  try {
    Object.defineProperties(globalThis, {
      window: { value: events, configurable: true },
      document: { value: { documentElement: root }, configurable: true },
      localStorage: { value: { setItem: (k,v) => saved.set(k,v) }, configurable: true },
    });
    let changes = 0;
    const stop = subscribeToTheme(() => changes++);
    setTheme('light');
    assert.equal(getTheme(), 'light');
    assert.equal(saved.get(THEME_STORAGE_KEY), 'light');
    assert.equal(changes, 1);
    const storage = new Event('storage');
    Object.assign(storage, { key: THEME_STORAGE_KEY, newValue: 'dark' });
    events.dispatchEvent(storage);
    assert.equal(getTheme(), 'dark');
    assert.equal(changes, 2);
    Object.assign(storage, {newValue:null});events.dispatchEvent(storage);
    assert.equal(getTheme(),'light');
    assert.equal(changes,3);
    stop();
    setTheme('light');
    assert.equal(changes, 3);
    Object.defineProperty(globalThis, 'localStorage', { value: { setItem() { throw Error('blocked'); } }, configurable: true });
    assert.doesNotThrow(() => setTheme('dark'));
    assert.equal(getTheme(), 'dark');
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});


test('legacy saved choices migrate while the new key wins and invalid choices fall back to light', () => {
  for (const [current, legacy, expected] of [[null,'dark','dark'], [null,'light','light'], ['light','dark','light'], ['dark','light','dark'], ['invalid','dark','light']]) {
    const root = makeRoot();
    const storage = new Map([['mama-theme', legacy]]);
    if (current !== null) storage.set('mma-theme', current);
    vm.runInNewContext(bootstrap, { document: { documentElement: root }, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) } });
    assert.equal(root.dataset.theme, expected);
    assert.ok(root.classList.contains(expected));
    if (current === null) assert.equal(storage.get('mma-theme'), legacy);
  }
});
