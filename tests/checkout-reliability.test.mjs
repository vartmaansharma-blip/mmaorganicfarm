import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const nativeRequire = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
function load(entry, mocks = {}, env = {}) {
  const cache = new Map();
  function read(full) {
    if (cache.has(full)) return cache.get(full).exports;
    const loadedModule = { exports: {} }; cache.set(full, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      fileName: full,
    }).outputText;
    const require = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === 'server-only') return {};
      if (id.endsWith('.css')) return { default: {} };
      if (!id.startsWith('.') && !id.startsWith('@/')) return nativeRequire(id);
      let target = id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(full), id);
      if (!path.extname(target)) target += fs.existsSync(target + '.ts') ? '.ts' : '.tsx';
      return read(target);
    };
    vm.runInThisContext(`(function(exports,require,module,process){${source}\n})`, { filename: full })(loadedModule.exports, require, loadedModule, { env });
    return loadedModule.exports;
  }
  return read(path.join(root, entry));
}
const testEnv = { RAZORPAY_KEY_ID: 'rzp_test_synthetic', RAZORPAY_KEY_SECRET: 'synthetic', VERCEL_ENV: 'preview' };

test('auth return rejects browser-normalized external redirects and preserves checkout choices', () => {
  const { safeAuthReturn } = load('lib/auth-return.ts');
  for (const bad of ['https://example.org', '//example.org', '/\\example.org', '/\t/example.org', '/\n/example.org', null, '/a b']) assert.equal(safeAuthReturn(bad), '/');
  const next = '/order?purchase=plan&start=2026-10-26&routine=milk%3A1%3Acustom';
  assert.equal(safeAuthReturn(next), next);
});
test('test/live mode and preview protection fail closed', () => {
  const { paymentModeError, razorpayMode } = load('lib/payment-mode.ts');
  assert.equal(razorpayMode('rzp_test_synthetic'), 'test');
  assert.equal(razorpayMode('typo'), null);
  assert.equal(paymentModeError(true, 'rzp_test_synthetic', 'preview'), null);
  assert.match(paymentModeError(false, 'rzp_test_synthetic', 'production'), /does not match/);
  assert.match(paymentModeError(true, 'rzp_live_synthetic', 'production'), /does not match/);
  assert.match(paymentModeError(false, 'rzp_live_synthetic', 'preview'), /disabled in previews/);
});
test('new live checkouts stay disabled until explicitly enabled', () => {
  const { liveCheckoutError } = load('lib/payment-mode.ts');
  assert.match(liveCheckoutError('rzp_live_synthetic', undefined), /not enabled/);
  assert.match(liveCheckoutError('rzp_live_synthetic', 'false'), /not enabled/);
  assert.equal(liveCheckoutError('rzp_live_synthetic', 'true'), null);
  assert.equal(liveCheckoutError('rzp_test_synthetic', 'false'), null);
});
test('only definitive provider rejections permit checkout recovery', () => {
  const { RazorpayRequestError } = load('lib/razorpay.ts');
  for (const code of [400, 401, 403, 422]) assert.equal(new RazorpayRequestError(code).definitelyRejected, true);
  for (const code of [408, 429, 500, 502, 503]) assert.equal(new RazorpayRequestError(code).definitelyRejected, false);
});
function client(order, events, respond = () => ({})) {
  return { from(table) {
    const q = { table, op: 'select', payload: null, filters: [] };
    const chain = {};
    for (const op of ['select','update','upsert','insert','eq','is']) chain[op] = (...args) => {
      if (['update','upsert','insert'].includes(op)) { q.op = op; q.payload = args[0]; }
      if (['eq','is'].includes(op)) q.filters.push([op, ...args]);
      return chain;
    };
    const result = () => { events.push(structuredClone(q)); return respond(q) ?? { data: order, error: null }; };
    chain.single = chain.maybeSingle = async () => result();
    chain.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
    return chain;
  } };
}
test('captured test payments are tagged and never activate plans, fulfilment, capacity or notifications', async () => {
  const events = []; let consumed = false;
  const order = { id: 'synthetic', user_id: 'user', delivery_plan_id: 'plan', purchase_mode: 'plan', total_paise: 6200, is_test: true };
  const admin = client(order, events, q => q.op === 'select' ? { data: order } : { data: {}, error: null });
  const { recordCapturedPayment } = load('lib/checkout-server.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/production-capacity': { consumeOrderCapacity: () => { consumed = true; } },
  }, testEnv);
  await recordCapturedPayment({ amount: 6200, orderId: order.id, paymentId: 'pay_synthetic', providerOrderId: 'order_synthetic' });
  assert.equal(events.find(e => e.table === 'payments').payload.is_test, true);
  assert.equal(events.some(e => e.table === 'orders' && e.op === 'update'), false);
  assert.equal(events.some(e => ['delivery_plans','customer_notifications','delivery_exceptions'].includes(e.table)), false);
  assert.equal(consumed, false);
});
test('test keys cannot record a live customer payment', async () => {
  const events = []; const order = { id: 'synthetic', total_paise: 6200, is_test: false };
  const admin = client(order, events, () => ({ data: order }));
  const { recordCapturedPayment } = load('lib/checkout-server.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/production-capacity': { consumeOrderCapacity: () => assert.fail('must not consume') },
  }, testEnv);
  await assert.rejects(() => recordCapturedPayment({ amount: 6200 }), /does not match/);
  assert.equal(events.some(e => e.op !== 'select'), false);
});
async function prepare({ failure, claimError = false, isTest = false, env, providerId = null, updateError = false, reboundProviderId = null, coupon = false, expectedAmount = null } = {}) {
  const events = []; let providerAmount; let providerCalls = 0, released = 0, reserved = 0;
  const order = { id: 'synthetic', user_id: 'user', status: 'draft', purchase_mode: 'plan', delivery_plan_id: 'plan', start_date: '2026-10-26', total_paise: coupon ? 5890 : 6200, subtotal_paise: 6200, discount_code: coupon ? 'MMA-ABCDEF1234567890' : null, discount_paise: coupon ? 310 : 0, is_test: isTest, razorpay_order_id: providerId };
  const userClient = client(order, events, q => {
    if (q.table === 'orders') return { data: order };
    if (q.table === 'order_items') return { data: [{ product_key: 'milk', quantity: 1, unit_price_paise: 6200, line_total_paise: 6200 }] };
    return { data: { billing_model: 'calendar_month', start_date: order.start_date, schedule_rules: [{ id: 'milk' }], scheduled_delivery_items: [] } };
  });
  userClient.auth = { getUser: async () => ({ data: { user: { id: 'user', user_metadata: {} } } }) };
  const admin = client(order, events, q => ({ data: { id: order.id, razorpay_order_id: reboundProviderId ?? providerId }, error: updateError && q.payload?.razorpay_order_id ? { message: 'unavailable' } : null }));
  admin.rpc = async () => ({ error: claimError ? { message: 'already claimed' } : null });
  const { RazorpayRequestError } = load('lib/razorpay.ts');
  const { POST } = load('app/api/payments/razorpay/order/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/supabase/server': { createClient: async () => userClient },
    '@/lib/supabase/admin': { createAdminClient: () => admin, hasSupabaseAdminConfig: () => true },
    '@/lib/production-capacity': { reserveOrderCapacity: async () => { reserved++; }, releaseOrderCapacity: async () => { released++; } },
    '@/lib/product-prices-server': {readOrderProductPrices: async () => ({milk:62,paneer:200,ghee:375,bottle:10})},
    '@/lib/monthly-checkout': { quoteStoredMonthlyCheckout: () => ({ total: 62 }) },
    '@/lib/checkout-quote': { quoteStoredCheckout: () => ({ total: 62 }) },
    '@/lib/first-scheduled-plan': { firstScheduledPlanStart: async () => null },
    '@/lib/razorpay': { hasRazorpayConfig: () => true, RazorpayRequestError, publicRazorpayKey: () => 'synthetic', createRazorpayOrder: async (input) => {
      providerAmount = input.amount; providerCalls++; if (failure === 'network') throw new Error('network timeout'); if (failure) throw new RazorpayRequestError(failure); return { id: 'order_synthetic' };
    } },
  }, env ?? { RAZORPAY_KEY_ID: 'rzp_live_synthetic', RAZORPAY_LIVE_CHECKOUT_ENABLED: 'true', VERCEL_ENV: 'production' });
  const result = await POST({ json: async () => ({ orderId: order.id, termsAccepted: true, expectedAmountPaise: expectedAmount ?? order.total_paise }) });
  return { result, events, providerCalls, providerAmount, released, reserved };
}
test('monthly provider rejection resets only its own unbound claim and releases capacity', async () => {
  const r = await prepare({ failure: 401 });
  assert.equal(r.result.status, 409); assert.equal(r.providerCalls, 1); assert.equal(r.released, 1);
  const reset = r.events.find(e => e.op === 'update' && e.payload.status === 'draft');
  assert.ok(reset.filters.some(f => f[1] === 'status' && f[2] === 'pending_payment'));
  assert.ok(reset.filters.some(f => f[0] === 'is' && f[1] === 'razorpay_order_id' && f[2] === null));
});
test('uncertain provider outcomes and competing claims stay frozen with capacity retained', async () => {
  for (const input of [{ failure: 'network' }, { failure: 500 }, { failure: 408 }, { failure: 429 }, { claimError: true }, { updateError: true }]) {
    const r = await prepare(input);
    assert.equal(r.result.status, 409); assert.equal(r.released, 0);
    assert.equal(r.events.some(e => e.op === 'update' && e.payload.status === 'draft'), false);
  }
});
test('test/live mismatch rejects before capacity, claims or provider requests', async () => {
  const r = await prepare({ env: testEnv });
  assert.equal(r.result.status, 409); assert.equal(r.providerCalls, 0); assert.equal(r.reserved, 0);
});
test('live checkout guard returns before capacity reservation and Razorpay creation', async () => {
  const r = await prepare({ env: { RAZORPAY_KEY_ID: 'rzp_live_synthetic', RAZORPAY_LIVE_CHECKOUT_ENABLED: 'false', VERCEL_ENV: 'production' } });
  assert.equal(r.result.status, 503);
  assert.match(r.result.body.error, /Live checkout is not enabled/);
  assert.equal(r.providerCalls, 0);
  assert.equal(r.reserved, 0);
});
test('test checkout bypasses real capacity and returns an explicit test result', async () => {
  const r = await prepare({ env: testEnv, isTest: true });
  assert.equal(r.result.status, 200); assert.equal(r.result.body.isTest, true); assert.equal(r.reserved, 0);
});
test('schema-cache errors give a retry message without exposing database internals', () => {
  const { databaseErrorMessage } = load('lib/database-errors.ts');
  assert.match(databaseErrorMessage({ code: 'PGRST202', message: 'public.secret' }, 'fallback'), /temporarily unavailable/);
  assert.equal(databaseErrorMessage({ code: '42501' }, 'fallback'), 'fallback');
});

test('completed monthly calendars remain viewable and query failures never pretend no plan exists', async () => {
  for (const failed of [false, true]) {
    let statuses;
    const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) }, from: () => {
      const q = {};
      for (const method of ['select', 'eq']) q[method] = () => q;
      q.in = (column, values) => { statuses = values; return q; };
      q.order = async () => ({ data: failed ? null : [{ id: 'plan', billing_model: 'calendar_month', status: 'completed', start_date: '2026-10-26', period_end_exclusive: '2026-11-26', scheduled_delivery_items: [] }], error: failed ? { code: 'PGRST200' } : null });
      q.then = (resolve) => Promise.resolve({ data: [], error: null }).then(resolve);
      return q;
    } };
    const { default: Calendar } = load('app/calendar/page.tsx', {
      '@/lib/supabase/server': { createClient: async () => supabase },
      './actions': {}, 'next/navigation': { redirect: () => assert.fail('must not redirect') },
    });
    if (failed) await assert.rejects(() => Calendar({ searchParams: Promise.resolve({}) }), /temporarily unavailable/);
    else assert.ok(await Calendar({ searchParams: Promise.resolve({}) }));
    assert.ok(statuses.includes('completed'));
  }
});

test('verification network failure keeps Pay disabled and offers status recovery', async () => {
  const states = []; let index = 0, options;
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  globalThis.window = { Razorpay: class { constructor(input) { options = input; } open() {} } };
  globalThis.fetch = async (url) => {
    if (url.endsWith('/order')) return { ok: true, json: async () => ({ keyId: 'synthetic', amount: 6200, providerOrderId: 'order_synthetic' }) };
    throw new Error('network disconnected after provider success');
  };
  try {
    const { RazorpayCheckoutButton } = load('app/checkout/review/razorpay-checkout-button.tsx', {
      react: { useState: () => { const slot = index++; states[slot] = slot === 0; return [states[slot], value => { states[slot] = value; }]; } },
      'next/navigation': { useRouter: () => ({ push: () => assert.fail('cannot confirm without verification') }) },
    });
    const tree = RazorpayCheckoutButton({ amount: '₹62', amountPaise: 6200, orderId: 'synthetic', ready: true });
    const button = tree.props.children.find(x => x?.type === 'button');
    await button.props.onClick();
    await options.handler({ razorpay_payment_id: 'pay_synthetic', razorpay_order_id: 'order_synthetic', razorpay_signature: 'synthetic' });
    options.modal.ondismiss();
    assert.equal(states[1], true, 'Pay stays disabled even if modal dismiss follows submission');
    assert.equal(states[2], true);
    assert.match(states[3], /Do not pay again/);
  } finally { globalThis.window = originalWindow; globalThis.fetch = originalFetch; }
});

test('monthly claim reuses a provider order bound after the first read', async () => {
  const r = await prepare({ reboundProviderId: 'order_already_bound' });
  assert.equal(r.result.status, 200);
  assert.equal(r.result.body.providerOrderId, 'order_already_bound');
  assert.equal(r.providerCalls, 0);
});

test('retired discounts and stale browser totals cannot start a provider payment', async () => {
  const r = await prepare({ coupon: true });
  assert.equal(r.result.status, 409);
  assert.equal(r.providerCalls, 0);
  const stale = await prepare({ expectedAmount: 6000 });
  assert.equal(stale.result.status, 409);
  assert.equal(stale.providerCalls, 0);
  assert.equal(stale.reserved, 0);
});
test('checkout displays exact paise amounts', () => {
  const { formatCheckoutAmount } = load('lib/checkout-display.ts');
  assert.equal(formatCheckoutAmount(6890), '₹68.90');
  assert.equal(formatCheckoutAmount(310), '₹3.10');
  assert.equal(formatCheckoutAmount(7200), '₹72');
});
