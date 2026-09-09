// Run with a local Vite server on port 5188:
// node scripts/test-signup-flow.cjs [path-to-playwright-module]
// Every Supabase request is mocked; this never creates a real account.
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        isMobile: mobile, hasTouch: mobile,
      });
      const page = await context.newPage();
      const calls = [];
      let creationFails = false;
      let loginSucceeds = false;
      const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'qa@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
      const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url')}.mock-signature`;
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        if (!url.hostname.endsWith('.supabase.co')) return route.abort();
        let data = [];
        let status = 200;
        const name = url.pathname.split('/functions/v1/')[1];
        if (name) {
          calls.push({ name, body: route.request().postDataJSON() });
          if (name === 'signup-create-user') {
            await new Promise(resolve => setTimeout(resolve, 250));
            status = creationFails ? 500 : 200;
            data = creationFails ? { error: 'Profile could not be saved' } : { success: true, isNewUser: true };
          } else if (name === 'verify-otp-login') {
            status = loginSucceeds ? 200 : 400;
            data = loginSucceeds ? { success: true, access_token: token, refresh_token: 'mock-refresh' } : { success: false, code: 'OTP_REJECTED', error: 'Invalid OTP' };
          } else data = { success: true, registered: true };
        } else if (url.pathname === '/auth/v1/user') data = user;
        else if (url.pathname.includes('/rpc/')) data = false;
        else if (route.request().headers().accept?.includes('object+json')) data = null;
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data),
          headers: { 'access-control-allow-origin': '*' } });
      });

      await page.goto('http://127.0.0.1:5188/auth?ref=INVITE');
      await page.evaluate(() => { window.__signupNavigationMarker = true; });
      await page.getByRole('button', { name: 'Sign up', exact: true }).click();
      await page.waitForURL('**/signup?ref=INVITE');
      assert.equal(await page.locator('#referralCode').inputValue(), 'INVITE');
      assert.equal(await page.evaluate(() => window.__signupNavigationMarker), true);

      await page.goto('http://127.0.0.1:5188/auth?ref=INVITE');
      await page.evaluate(() => { window.__signupNavigationMarker = true; });
      await page.getByRole('link', { name: 'Create an account' }).click();
      await page.waitForURL('**/signup?ref=INVITE');
      assert.equal(await page.evaluate(() => window.__signupNavigationMarker), true);
      await page.locator('#fullName').fill('Signup Regression');
      await page.locator('#phone').fill('9999000006');
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Send OTP', exact: true }).click();
      await page.locator('input[data-input-otp="true"]').fill('123456');
      calls.length = 0;
      // Dispatch two taps in the same task, before React updates disabled.
      await page.getByRole('button', { name: 'Create Account', exact: true }).evaluate(button => {
        button.click(); button.click();
      });
      await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
      assert.deepEqual(calls.map(c => c.name), ['signup-create-user', 'verify-otp-login']);
      assert.equal(calls[0].body.referralCode, 'INVITE');

      assert.equal(calls[0].body.founder, false);
      assert.equal(calls[0].body.phone, calls[1].body.phone);
      assert.equal(await page.locator('input[data-input-otp="true"]').inputValue(), '123456');
      assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k))), false);

      creationFails = true;
      calls.length = 0;
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await page.getByText('Profile could not be saved', { exact: true }).first().waitFor();
      assert.deepEqual(calls.map(c => c.name), ['signup-create-user']);
      assert.equal(calls[0].body.fullName, 'Signup Regression');
      assert.equal(calls[0].body.referralCode, 'INVITE');

      creationFails = false;
      loginSucceeds = true;
      calls.length = 0;
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await page.waitForURL('**/complete-registration');
      assert.deepEqual(calls.map(c => c.name), ['signup-create-user', 'verify-otp-login']);
      assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k))), true);
      await page.evaluate(() => localStorage.clear());
      loginSucceeds = false;

      // Existing login still calls the existing OTP/session path, never signup.
      await page.goto('http://127.0.0.1:5188/auth');
      await page.locator('input[type="tel"]').fill('9999000006');
      await page.getByRole('button', { name: 'Send OTP', exact: true }).click();
      await page.locator('input[data-input-otp="true"]').fill('000000');
      calls.length = 0;
      await page.getByRole('button', { name: 'Verify & Continue', exact: true }).click();
      await page.getByText('Invalid OTP', { exact: true }).first().waitFor();
      assert.deepEqual(calls.map(c => c.name), ['verify-otp-login']);
      console.log(`PASS ${mobile ? 'mobile' : 'desktop'}: both signup links, referral retention, no page reload, single verification, duplicate taps, retry data, server errors, successful registration redirect/session, invalid OTP, ordinary login`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
