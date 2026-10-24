import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { getServerTheme, getTheme, setTheme, subscribeToTheme } from '../lib/theme.ts';

const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const bootstrap = layout.match(/__html: `([^`]+)`/)[1];

test('first visits retain the chat-approved dark default, even on a light OS', () => {
  const root = { dataset: {}, style: {} };
  vm.runInNewContext(bootstrap, { document: { documentElement: root }, localStorage: { getItem: () => null }, matchMedia: () => ({ matches: true }) });
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.style.colorScheme, 'dark');
  assert.equal(getServerTheme(), 'dark');
});

test('saved light choice applies before hydration and blocked storage keeps a usable default', () => {
  for (const blocked of [false, true]) {
    const root = { dataset: {}, style: {} };
    vm.runInNewContext(bootstrap, { document: { documentElement: root }, localStorage: { getItem: () => { if (blocked) throw Error('blocked'); return 'light'; } } });
    assert.equal(root.dataset.theme, blocked ? 'dark' : 'light');
  }
});

test('explicit selection persists, broadcasts once and synchronizes other tabs without reload', () => {
  const previous = Object.fromEntries(['window', 'document', 'localStorage'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const events = new EventTarget();
  const root = { dataset: { theme: 'dark' }, style: {} };
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
    assert.equal(saved.get('mama-theme'), 'light');
    assert.equal(changes, 1);
    const storage = new Event('storage');
    Object.assign(storage, { key: 'mama-theme', newValue: 'dark' });
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
