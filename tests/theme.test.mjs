import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { THEME_STORAGE_KEY, getServerTheme, getTheme, setTheme, subscribeToTheme } from '../lib/theme.ts';

function makeRoot() { const classes = new Set(); return { dataset: {}, style: {}, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) } }; }

const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const bootstrap = layout.match(/__html: `([^`]+)`/)[1];

test('first visits retain the chat-approved dark default, even on a light OS', () => {
  const root = makeRoot();
  vm.runInNewContext(bootstrap, { document: { documentElement: root }, localStorage: { getItem: () => null }, matchMedia: () => ({ matches: true }) });
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.style.colorScheme, 'dark');
  assert.ok(root.classList.contains('dark'));
  assert.equal(getServerTheme(), 'dark');
});

test('saved light choice applies before hydration and blocked storage keeps a usable default', () => {
  for (const blocked of [false, true]) {
    const root = makeRoot();
    vm.runInNewContext(bootstrap, { document: { documentElement: root }, localStorage: { getItem: () => { if (blocked) throw Error('blocked'); return 'light'; } } });
    assert.equal(root.dataset.theme, blocked ? 'dark' : 'light');
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
    stop();
    setTheme('light');
    assert.equal(changes, 2);
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


test('legacy saved choices migrate while the new key wins and invalid choices fall back to dark', () => {
  for (const [current, legacy, expected] of [[null,'light','light'], ['dark','light','dark'], ['invalid','light','dark']]) {
    const root = makeRoot();
    const storage = new Map([['mama-theme', legacy]]);
    if (current !== null) storage.set('mma-theme', current);
    vm.runInNewContext(bootstrap, { document: { documentElement: root }, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) } });
    assert.equal(root.dataset.theme, expected);
    assert.ok(root.classList.contains(expected));
    if (current === null) assert.equal(storage.get('mma-theme'), legacy);
  }
});
