# Mobile App Assets Setup Guide

This guide explains how to generate and configure app icons and splash screens for the three ELA Foods mobile apps.

## Quick Setup

### 1. Install Capacitor Assets Plugin

```bash
npm install --save-dev @capacitor/assets
```

### 2. Create Base Assets

Create a 1024x1024 icon and 2732x2732 splash for each app:

```
resources/
├── customer/
│   ├── icon.png          # 1024x1024 with orange background
│   └── splash.png        # 2732x2732 with orange background + logo
├── driver/
│   ├── icon.png          # 1024x1024 with green background
│   └── splash.png        # 2732x2732 with green background + logo
└── member/
    ├── icon.png          # 1024x1024 with purple background
    └── splash.png        # 2732x2732 with purple background + logo
```

### 3. Generate Assets for Each App

**Customer App:**
```bash
# Copy customer config
cp capacitor.config.customer.ts capacitor.config.ts

# Generate assets
npx capacitor-assets generate \
  --iconBackgroundColor '#f97316' \
  --iconBackgroundColorDark '#ea580c' \
  --splashBackgroundColor '#f97316' \
  --splashBackgroundColorDark '#ea580c'
```

**Driver App:**
```bash
# Copy driver config
cp capacitor.config.driver.ts capacitor.config.ts

# Generate assets
npx capacitor-assets generate \
  --iconBackgroundColor '#16a34a' \
  --iconBackgroundColorDark '#15803d' \
  --splashBackgroundColor '#16a34a' \
  --splashBackgroundColorDark '#15803d'
```

**Member App:**
```bash
# Copy member config
cp capacitor.config.member.ts capacitor.config.ts

# Generate assets
npx capacitor-assets generate \
  --iconBackgroundColor '#7c3aed' \
  --iconBackgroundColorDark '#6d28d9' \
  --splashBackgroundColor '#7c3aed' \
  --splashBackgroundColorDark '#6d28d9'
```

## Brand Guidelines

### Customer App - ELA Foods 🍽️
- **Primary Color**: Orange `#f97316` (hsl(25, 95%, 53%))
- **Dark Variant**: `#ea580c`
- **Theme**: Warm, appetizing, consumer-friendly
- **Icon**: ELA Foods logo on orange background
- **Tagline**: "Delicious snacks delivered"

### Driver App - ELA Delivery 🚚
- **Primary Color**: Green `#16a34a` (hsl(142, 76%, 36%))
- **Dark Variant**: `#15803d`
- **Theme**: Go, action, reliability, speed
- **Icon**: ELA logo with delivery icon on green background
- **Tagline**: "Deliver with ELA"

### Member App - ELA Network 🌐
- **Primary Color**: Purple `#7c3aed` (hsl(263, 83%, 58%))
- **Dark Variant**: `#6d28d9`
- **Theme**: Premium, network, business, growth
- **Icon**: ELA logo with network/tree icon on purple background
- **Tagline**: "Grow your network"

## Manual Asset Creation

If you prefer to create assets manually:

### Icon Specifications

| Platform | Size | Scale | Filename |
|----------|------|-------|----------|
| iOS | 1024x1024 | 1x | AppIcon.png |
| iOS | 180x180 | 3x | Icon-60@3x.png |
| iOS | 120x120 | 2x | Icon-60@2x.png |
| iOS | 167x167 | 2x | Icon-83.5@2x.png |
| iOS | 152x152 | 2x | Icon-76@2x.png |
| Android | 192x192 | xxxhdpi | ic_launcher.png |
| Android | 144x144 | xxhdpi | ic_launcher.png |
| Android | 96x96 | xhdpi | ic_launcher.png |
| Android | 72x72 | hdpi | ic_launcher.png |
| Android | 48x48 | mdpi | ic_launcher.png |

### Splash Screen Specifications

| Platform | Size | Usage |
|----------|------|-------|
| Universal | 2732x2732 | iPad Pro 12.9" |
| iOS | 1242x2688 | iPhone XS Max |
| iOS | 828x1792 | iPhone XR |
| iOS | 1125x2436 | iPhone X/XS |
| iOS | 750x1334 | iPhone 8/7/6 |
| Android | 1440x2560 | xxxhdpi |
| Android | 1080x1920 | xxhdpi |
| Android | 720x1280 | xhdpi |
| Android | 480x800 | hdpi |

## iOS Configuration (Info.plist)

The splash screen is configured in `ios/App/App/Info.plist`:

```xml
<key>UILaunchStoryboardName</key>
<string>LaunchScreen</string>
```

## Android Configuration

### res/values/styles.xml
```xml
<style name="AppTheme.NoActionBarLaunch" parent="AppTheme.NoActionBar">
    <item name="android:background">@drawable/splash</item>
</style>
```

### res/drawable/splash.xml
```xml
<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/splash_background"/>
    <item>
        <bitmap
            android:gravity="center"
            android:src="@drawable/splash_logo"/>
    </item>
</layer-list>
```

## Capacitor Configuration

Each app's capacitor config includes splash screen settings:

```typescript
plugins: {
  SplashScreen: {
    launchShowDuration: 2000,
    launchAutoHide: true,
    backgroundColor: '#f97316', // App-specific color
    showSpinner: false,
    androidSpinnerStyle: 'small',
    iosSpinnerStyle: 'small',
    spinnerColor: '#ffffff',
    splashFullScreen: true,
    splashImmersive: true,
  },
},
```

## Adaptive Icons (Android)

For Android 8.0+, create adaptive icons:

```
android/app/src/main/res/
├── mipmap-anydpi-v26/
│   └── ic_launcher.xml
├── mipmap-hdpi/
│   ├── ic_launcher_foreground.png
│   └── ic_launcher_background.png
└── ...
```

ic_launcher.xml:
```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
```

## Testing

After generating assets:

1. Build the app: `npm run build`
2. Sync to native: `npx cap sync`
3. Run on device/emulator: `npx cap run ios` or `npx cap run android`
4. Verify:
   - App icon appears correctly on home screen
   - Splash screen shows with correct branding
   - Splash screen transitions smoothly to app
