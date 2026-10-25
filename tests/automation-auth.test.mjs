import assert from 'node:assert/strict';
import test from 'node:test';
import {authorizedAutomation} from '../lib/automation-auth.ts';
test('automation authentication fails closed for missing configuration, missing header, short secret, and guessed bearer',()=>{const secret='a-valid-local-fixture-secret-with-32-characters';assert.equal(authorizedAutomation(null,secret),false);assert.equal(authorizedAutomation('Bearer undefined',undefined),false);assert.equal(authorizedAutomation('Bearer short','short'),false);assert.equal(authorizedAutomation('Bearer wrong',secret),false);assert.equal(authorizedAutomation(`Bearer ${secret}`,secret),true);});
