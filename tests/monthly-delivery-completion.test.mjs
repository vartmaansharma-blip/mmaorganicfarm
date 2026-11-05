import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completedMonthlyDates } from '../lib/monthly-delivery-completion.ts';

const items = [
  { delivery_date: '2026-11-05', product_key: 'milk', quantity: 2, unit: 'L' },
  { delivery_date: '2026-11-05', product_key: 'paneer', quantity: 1, unit: 'kg' },
];
const record = { delivery_date: '2026-11-05', status: 'delivered', delivery_confirmed: true,
  daily_delivery_items: items.map(item => ({ ...item, fulfilled_quantity: item.quantity })) };
test('a monthly date requires all scheduled quantities in a confirmed operational visit', () => {
  assert.deepEqual(completedMonthlyDates(items, [record]), ['2026-11-05']);
  assert.deepEqual(completedMonthlyDates(items, [{ ...record, delivery_confirmed: false }]), []);
  assert.deepEqual(completedMonthlyDates(items, [{ ...record, status: 'ready' }]), []);
  assert.deepEqual(completedMonthlyDates(items, [{ ...record, daily_delivery_items: record.daily_delivery_items.slice(0, 1) }]), []);
  assert.deepEqual(completedMonthlyDates(items, [{ ...record, daily_delivery_items: record.daily_delivery_items.map(item => ({ ...item, fulfilled_quantity: null })) }]), []);
  assert.deepEqual(completedMonthlyDates(items, [record, record]), []);
  assert.deepEqual(completedMonthlyDates(items, []), []);
});
