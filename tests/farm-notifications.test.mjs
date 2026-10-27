import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notificationHref,notificationTime} from '../lib/farm-notifications.ts';
test('notification destinations stay inside the farm workspace',()=>{
 for(const href of ['https://other.invalid/farm','//other.invalid/farm','/farmers','/farm\\evil','/farm\nnext','javascript:alert(1)'])assert.equal(notificationHref(href),'/farm/activity');
 for(const href of ['/farm','/farm/production?date=2026-10-27','/farm/payments','/farm/runs#record'])assert.equal(notificationHref(href),href);
});
test('notification timestamps use India time rather than the device timezone',()=>{
 assert.match(notificationTime('2026-10-26T23:30:00Z'),/27 Oct/);assert.match(notificationTime('2026-10-26T23:30:00Z'),/5:00/);
});
