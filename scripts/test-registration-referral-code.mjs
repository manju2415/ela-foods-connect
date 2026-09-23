import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/_shared/completeRegistration.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { completeRegistration } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function client({ paid = 0, updateFails = false, code = 'ELA123' } = {}) {
  const events = [];
  return {
    events,
    from(table) {
      let operation = 'select';
      const query = {
        select() { return query; },
        eq() { return query; },
        order() { return query; },
        limit() { return query; },
        update(value) { operation = 'update'; events.push([table, operation, value]); return query; },
        upsert(value) { operation = 'upsert'; events.push([table, operation, value]); return query; },
        maybeSingle() { return Promise.resolve(result()); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      function result() {
        if (operation === 'update') return { error: updateFails ? new Error('update failed') : null };
        const rows = {
          profiles: { registration_fee_paid: paid, user_level: 'associate', mlm_settings_version_id: 'version' },
          mlm_settings: { value: { total: 2499 } },
          referrals: { id: 'existing-invitation' },
          wallets: { id: 'wallet' },
          wallet_transactions: { id: 'existing-bonus' },
        };
        return { data: rows[table] ?? null };
      }
      return query;
    },
    async rpc(name) {
      events.push([name]);
      return { data: name === 'generate_user_referral_code' ? code : 'wallet', error: null };
    },
  };
}

test('invited user receives a code after payment and membership activation', async () => {
  const db = client();
  assert.equal((await completeRegistration(db, 'user', 'payment', 2499)).success, true);
  const codeIndex = db.events.findIndex(([name]) => name === 'generate_user_referral_code');
  assert.ok(codeIndex > db.events.findIndex(([name]) => name === 'profiles'));
  assert.ok(codeIndex > db.events.findIndex(([name]) => name === 'user_roles'));
});

test('already-paid invitation retries still ensure a referral code exists', async () => {
  const db = client({ paid: 2499 });
  assert.equal((await completeRegistration(db, 'user', 'payment', 2499)).success, true);
  assert.equal(db.events.filter(([name]) => name === 'generate_user_referral_code').length, 1);
});

test('underpayment and failed payment recording never generate codes', async () => {
  for (const [options, amount] of [[{}, 100], [{ updateFails: true }, 2499]]) {
    const db = client(options);
    assert.equal((await completeRegistration(db, 'user', 'payment', amount)).success, false);
    assert.equal(db.events.some(([name]) => name === 'generate_user_referral_code'), false);
  }
});

test('code creation failure remains retryable', async () => {
  const db = client({ paid: 2499, code: null });
  assert.equal((await completeRegistration(db, 'user', 'payment', 2499)).success, false);
});
