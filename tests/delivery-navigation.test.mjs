import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryNavigationUrl, hasConfirmedDestination } from '../lib/delivery-navigation.ts';
test('navigation uses a confirmed GPS destination without inventing a driver origin',()=>{
  const url=new URL(deliveryNavigationUrl({address_snapshot:'Written address',destination_latitude:22.8,destination_longitude:86.2,destination_confirmed_at:'2026-10-26T00:00:00Z'}));
  assert.equal(url.searchParams.get('destination'),'22.8,86.2');assert.equal(url.searchParams.has('origin'),false);
});
test('unconfirmed, invalid or missing pins fall back to an encoded written address',()=>{
  for(const pin of [{},{destination_latitude:22.8,destination_longitude:86.2},{destination_latitude:Infinity,destination_longitude:86.2,destination_confirmed_at:'now'},{destination_latitude:91,destination_longitude:86.2,destination_confirmed_at:'now'}]) {
    const stop={address_snapshot:'Gate 2 & Road 4, Jamshedpur',...pin};
    assert.equal(hasConfirmedDestination(stop),false);
    assert.equal(new URL(deliveryNavigationUrl(stop)).searchParams.get('destination'),stop.address_snapshot);
  }
  assert.equal(deliveryNavigationUrl({address_snapshot:'  '}),null);
});
test('zero coordinates are valid only when explicitly confirmed',()=>{
  assert.equal(hasConfirmedDestination({address_snapshot:'Equator',destination_latitude:0,destination_longitude:0,destination_confirmed_at:'now'}),true);
});

import { isMissingDestinationSchema } from '../lib/routing-schema.ts';
test('only a missing additive destination column enables schema compatibility',()=>{
  assert.equal(isMissingDestinationSchema({code:'42703',message:'column daily_deliveries.destination_latitude does not exist'}),true);
  assert.equal(isMissingDestinationSchema({code:'PGRST204',message:'destination_longitude missing from schema cache'}),true);
  assert.equal(isMissingDestinationSchema({code:'42501',message:'permission denied for destination_latitude'}),false);
  assert.equal(isMissingDestinationSchema({code:'42703',message:'column customer_name does not exist'}),false);
  assert.equal(isMissingDestinationSchema(new Error('Network failed')),false);
});
