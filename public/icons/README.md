# Mobile App Icons and Splash Screens

This directory contains the icons and splash screen assets for the three ELA Foods mobile apps.

## Directory Structure

```
icons/
├── customer/           # ELA Foods Customer App (Orange theme)
│   ├── icon-*.png     # App icons at various sizes
│   └── splash-*.png   # Splash screen images
├── driver/            # ELA Delivery Driver App (Green theme)
│   ├── icon-*.png
│   └── splash-*.png
├── member/            # ELA Network Member App (Purple theme)
│   ├── icon-*.png
│   └── splash-*.png
└── shared/            # Shared assets
    └── logo.png       # ELA Foods logo
```

## Brand Colors

- **Customer App**: Orange (#f97316) - Warm, appetizing, consumer-friendly
- **Driver App**: Green (#16a34a) - Go, action, delivery, reliability
- **Member App**: Purple (#7c3aed) - Premium, network, business

## Icon Sizes Required

### iOS
- 20x20, 29x29, 40x40, 60x60, 76x76, 83.5x83.5, 1024x1024
- @2x and @3x versions

### Android
- 36x36 (ldpi), 48x48 (mdpi), 72x72 (hdpi)
- 96x96 (xhdpi), 144x144 (xxhdpi), 192x192 (xxxhdpi)
- 512x512 (Play Store)

## Splash Screen Sizes

### iOS
- 2732x2732 (Universal)
- 1242x2688, 828x1792, 1125x2436, 750x1334

### Android
- 480x800 (mdpi), 720x1280 (hdpi)
- 1080x1920 (xhdpi), 1440x2560 (xxhdpi)

## Generating Assets

After adding base icons, use a tool like:
- `cordova-res` (npm package)
- App Icon Generator (web tool)
- Capacitor Assets plugin

Run: `npx @capacitor/assets generate --iconBackgroundColor '#f97316' --splashBackgroundColor '#f97316'`
