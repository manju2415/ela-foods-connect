# ELA Foods Mobile Apps - Build Guide

This project contains three separate mobile apps built with Capacitor:

## App Configurations

| App          | Config File                    | App ID        | Entry Route     | Theme Color      |
| ------------ | ------------------------------ | ------------- | --------------- | ---------------- |
| **Customer** | `capacitor.config.customer.ts` | `...customer` | `/customer-app` | Orange `#f97316` |
| **Driver**   | `capacitor.config.driver.ts`   | `...driver`   | `/driver-app`   | Green `#16a34a`  |
| **Member**   | `capacitor.config.member.ts`   | `...member`   | `/member-app`   | Purple `#7c3aed` |

## Features by App

### Customer App (ELA Foods) 🍽️

- Browse products and categories
- Shopping cart and checkout
- Order tracking
- Wishlist management
- Wallet and payments
- Push notifications for order updates

### Driver App (ELA Delivery) 🚚

- View assigned deliveries
- Update delivery status
- **Offline mode** with local caching
- Earnings history
- Navigation support
- Push notifications for new orders

### Member App (ELA Network) 🌐

- Referral network tree
- Commission tracking
- Wallet with withdrawable balance
- Team performance analytics
- Push notifications for referral activity

---

## Building Separate Apps

### Prerequisites

1. Export project to GitHub and clone locally
2. Install dependencies: `npm install`
3. For iOS: Xcode with Command Line Tools
4. For Android: Android Studio with SDK

### Build Instructions

#### Customer App

```bash
# 1. Copy customer config
cp capacitor.config.customer.ts capacitor.config.ts

# 2. Add platforms (first time only)
npx cap add ios
npx cap add android

# 3. Build and sync
npm run build
npx cap sync

# 4. Generate app icons and splash screens
npx capacitor-assets generate \
  --iconBackgroundColor '#f97316' \
  --splashBackgroundColor '#f97316'

# 5. Run on device/emulator
npx cap run ios
# or
npx cap run android
```

#### Driver App

```bash
cp capacitor.config.driver.ts capacitor.config.ts
npx cap add ios && npx cap add android
npm run build && npx cap sync

npx capacitor-assets generate \
  --iconBackgroundColor '#16a34a' \
  --splashBackgroundColor '#16a34a'

npx cap run ios  # or android
```

#### Member App

```bash
cp capacitor.config.member.ts capacitor.config.ts
npx cap add ios && npx cap add android
npm run build && npx cap sync

npx capacitor-assets generate \
  --iconBackgroundColor '#7c3aed' \
  --splashBackgroundColor '#7c3aed'

npx cap run ios  # or android
```

---

## App Icons & Splash Screens

Each app uses branded colors for its splash screen and icons:

| App      | Background       | Spinner | Status Bar  |
| -------- | ---------------- | ------- | ----------- |
| Customer | Orange `#f97316` | White   | Light style |
| Driver   | Green `#16a34a`  | White   | Light style |
| Member   | Purple `#7c3aed` | White   | Light style |

### Generating Assets

1. Install the assets plugin:

```bash
npm install -D @capacitor/assets
```

1. Create base assets in `resources/`:

```text
resources/
├── icon.png          # 1024x1024 app icon
├── icon-foreground.png  # For adaptive icons (Android)
├── splash.png        # 2732x2732 splash screen
└── splash-dark.png   # Optional dark mode splash
```

1. Generate all sizes:

```bash
npx capacitor-assets generate
```

See `MOBILE_ASSETS.md` for detailed asset specifications.

---

## FCM Push Notifications Setup

1. Create Firebase project at [console.firebase.google.com](https://console.firebase.google.com)

2. Download config files:
   - **iOS**: `GoogleService-Info.plist` → `ios/App/App/`
   - **Android**: `google-services.json` → `android/app/`

3. Add FCM server key to secrets:
   - Get Server Key from Firebase Console → Project Settings → Cloud Messaging
   - Add as `FCM_SERVER_KEY` in project secrets

---

## Offline Mode (Driver App)

The Driver app supports offline operation:

- **Local Caching**: Order assignments cached in localStorage
- **Queued Updates**: Status changes queued when offline
- **Auto Sync**: Pending changes sync when back online
- **Visual Indicator**: Shows online/offline status

---

## Hot Reload Development

All configs point to the Lovable preview URL for hot reload during development.
For production builds, update the `server.url` to use local assets:

```typescript
// Remove server block for production
server: {
  // url: '...', // Comment out for production
},
```

---

## Troubleshooting

### Splash screen not showing

- Ensure `@capacitor/splash-screen` is installed
- Run `npx cap sync` after config changes

### Icons not updating

- Clear app cache on device
- Reinstall the app completely

### Push notifications not working

- Verify FCM config files are in correct locations
- Check that FCM_SERVER_KEY secret is set
- Ensure app has notification permissions
- Android 13+: add `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` to `android/app/src/main/AndroidManifest.xml`
- The app asks only after the user taps **Enable notifications** in Profile; it never prompts during startup
- After changing native plugins/config, run `npm install && npx cap sync android`, uninstall the old APK, then rebuild/install cleanly
- Production APKs must load bundled assets: remove the `server.url` block from `capacitor.config.ts` before the release build

### Contacts picker ("From contacts" in Invite Friends & Family)

Uses `@capacitor-community/contacts`. After `npm install && npx cap sync`, add the platform permissions:

**Android** — `android/app/src/main/AndroidManifest.xml`, inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.READ_CONTACTS" />
```

**iOS** — `ios/App/App/Info.plist`:

```xml
<key>NSContactsUsageDescription</key>
<string>We use your contacts so you can quickly add a member by picking their number.</string>
```

Then rebuild the app. On the web, the button falls back to the browser Contact Picker (Chrome on Android) and is hidden where unsupported.

## Android contacts permission (required for the in-app contact list)

The ds "Invite Frien& Family" screen can read the full address book to show a searchable list
with "already registered" badges. That needs an explicit permission in the
native manifest — without it the list shows "Could not read your contacts".

Add to `android/app/src/main/AndroidManifest.xml` inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.READ_CONTACTS" />
```

Then rebuild: `npx cap sync android`.

Without this permission the app falls back to Android's own contact chooser
(no permission required), which still fills in the name and mobile number.
