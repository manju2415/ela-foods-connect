// Guest access in the installed app (App Store guideline 5.1.1(v)): browsing
// is open to everyone; account features ask guests to sign in first.

/** Where the installed app opens. Signed-in users go through /auth, which sends each role to its own app. */
export const nativeLaunchPath = (signedIn: boolean) => (signedIn ? "/auth" : "/customer-app");

/** An account-only screen: guests sign in first and are brought back to it. */
export const accountPath = (path: string, signedIn: boolean) => (signedIn ? path : `/auth?redirect=${path}`);
