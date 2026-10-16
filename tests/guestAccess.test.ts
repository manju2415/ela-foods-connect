// Guest browsing in the installed app (App Store guideline 5.1.1(v)).
// Run: npx -y deno test --allow-read tests/
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { accountPath, nativeLaunchPath } from "../src/lib/guestAccess.ts";

const read = (path: string) => Deno.readTextFileSync(new URL(`../${path}`, import.meta.url));

Deno.test("installed app opens on the shop for guests and routes signed-in users by role", () => {
  assertEquals(nativeLaunchPath(false), "/customer-app");
  assertEquals(nativeLaunchPath(true), "/auth");
});

Deno.test("account screens ask guests to sign in and return them afterwards", () => {
  assertEquals(accountPath("/customer-app/addresses", false), "/auth?redirect=/customer-app/addresses");
  assertEquals(accountPath("/customer-app/addresses", true), "/customer-app/addresses");
});

Deno.test("native launch route uses the guest-aware launch screen, not a login redirect", () => {
  const app = read("src/App.tsx");
  assertMatch(app, /<Route path="\/" element=\{Capacitor\.isNativePlatform\(\) \? <NativeHome \/> : <Index \/>\} \/>/);
});

Deno.test("browsing routes are not behind a sign-in guard", () => {
  const app = read("src/App.tsx");
  for (const path of ["/customer-app", "/shop", "/products", "/categories", "/category/:slug", "/category/:slug/:subSlug", "/product/:slug", "/customer-app/cart", "/guest-checkout"]) {
    const route = app.match(new RegExp(`<Route path="${path.replace(/[/:]/g, "\\$&")}" element=\\{(.*)\\} />`));
    assert(route, `route ${path} exists`);
    assert(!/Guard/.test(route[1]), `route ${path} must not require sign-in`);
  }
});

Deno.test("customer app home lets guests in instead of redirecting to /auth", () => {
  const page = read("src/pages/CustomerApp.tsx");
  const guestBranch = page.match(/if \(!user\) \{([\s\S]*?)\n {4}\}/);
  assert(guestBranch, "guest branch exists");
  assert(!guestBranch[1].includes("navigate("), "guests are not redirected");
  assert(guestBranch[1].includes("setCheckingRegistration(false)"), "guests get past the splash");
});

Deno.test("account features still require sign-in", () => {
  for (const [file, redirect] of [
    ["src/pages/mobile/customer/OrdersPage.tsx", "/auth?redirect=/customer-app/orders"],
    ["src/pages/mobile/customer/WalletPage.tsx", "/auth?redirect=/customer-app/wallet"],
    ["src/pages/mobile/customer/ProfilePage.tsx", "/auth?redirect=/customer-app/profile"],
    ["src/pages/mobile/customer/OrderDetailPage.tsx", "/auth?redirect=/customer-app/orders"],
    ["src/pages/Checkout.tsx", "/auth?redirect=/checkout"],
  ]) {
    assert(read(file).includes(redirect), `${file} sends guests to sign in`);
  }
  assert(read("src/components/mobile/AppHomeTopBar.tsx").includes('accountPath("/customer-app/addresses", !!user)'));
});
