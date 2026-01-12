# App Build Configurations

This project supports three separate mobile app builds using Capacitor:

## 1. Customer App (ELA Foods)
- **App ID:** `app.lovable.aab01a9c384445a1bae56f4a0a52a33f.customer`
- **Entry Route:** `/customer-app`
- **Features:** Browse products, place orders, track deliveries, manage wallet

## 2. Driver App (ELA Delivery)
- **App ID:** `app.lovable.aab01a9c384445a1bae56f4a0a52a33f.driver`
- **Entry Route:** `/driver-app`
- **Features:** View assignments, update delivery status, earnings tracking, offline mode

## 3. Member App (ELA Network)
- **App ID:** `app.lovable.aab01a9c384445a1bae56f4a0a52a33f.member`
- **Entry Route:** `/member-app`
- **Features:** MLM network view, referral management, wallet & withdrawals

## Building Separate Apps

### Prerequisites
1. Export to GitHub and clone the repository
2. Run `npm install`
3. For iOS: macOS with Xcode installed
4. For Android: Android Studio installed

### Customer App Build
```bash
# Copy customer config
cp capacitor.config.customer.ts capacitor.config.ts

# Add platforms
npx cap add ios
npx cap add android

# Build and sync
npm run build
npx cap sync

# Run
npx cap run ios     # or android
```

### Driver App Build
```bash
# Copy driver config
cp capacitor.config.driver.ts capacitor.config.ts

# Add platforms (if not already)
npx cap add ios
npx cap add android

# Build and sync
npm run build
npx cap sync

# Run
npx cap run ios     # or android
```

### Member App Build
```bash
# Copy member config
cp capacitor.config.member.ts capacitor.config.ts

# Add platforms (if not already)
npx cap add ios
npx cap add android

# Build and sync
npm run build
npx cap sync

# Run
npx cap run ios     # or android
```

## FCM Push Notifications Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Cloud Messaging for your project
3. Download `google-services.json` (Android) and place in `android/app/`
4. Download `GoogleService-Info.plist` (iOS) and place in `ios/App/App/`
5. Add FCM Server Key to Supabase secrets for sending notifications

## Offline Mode (Driver App)

The driver app supports offline mode:
- Delivery assignments are cached locally
- Status updates are queued when offline
- Auto-sync when back online
- Visual indicator shows connection status
