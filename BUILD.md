# Ela Bazar: how to build the Android and iOS apps

Follow these steps exactly. **Do NOT run `npx cap add android` or `npx cap add ios`**, because both projects already exist and that command fails. **Do NOT copy any `capacitor.config.*.ts` file.** `MOBILE_BUILDS.md` is out of date; use this file instead.

## Tools needed

| Tool | Version |
| --- | --- |
| Node.js | 22 or newer (`node -v`) |
| Android Studio | Latest, with Android SDK 36 |
| Xcode (iOS only, Mac only) | 16 or newer |

## 1. Prepare (both platforms)

Run in the project folder (the unzipped folder):

```bash
npm ci
npm run build
```

- `npm ci` installs the exact versions from `package-lock.json`.
- `npm run build` creates the `dist` folder. **The app is built from `dist`.** If you skip this step, the app will be old or blank.
- The `.env` file is included in the zip and is needed. Do not delete it.

## 2. Android

```bash
npx cap sync android
npx cap open android
```

In Android Studio:

1. Wait for **Gradle sync** to finish.
2. Increase the version in `android/app/build.gradle`: `versionCode` (+1) and `versionName`. The Play Store rejects a version number it has already received.
3. Go to **Build → Generate Signed App Bundle / APK → Android App Bundle**, and sign with the company's release keystore. The keystore is not in the zip.
4. Upload the `.aab` file to the Play Console.

## 3. iOS (on a Mac)

```bash
npx cap sync ios
npx cap open ios
```

In Xcode:

1. Select the **App** target. Under **Signing & Capabilities**, choose the company team.
2. Increase **Version** / **Build** under General.
3. Choose the device **Any iOS Device (arm64)**, then **Product → Archive**.
4. In **Organizer**, click **Distribute App → App Store Connect**.

- The iOS project uses Swift Package Manager. Do not run `pod install`.
- `GoogleService-Info.plist` is not in the zip. The app builds without it, but push notifications on iPhone need it in `ios/App/App/`.

## If something fails

| Problem | Fix |
| --- | --- |
| App shows old screens | Run `npm run build`, then `npx cap sync` again |
| `npm run build` fails on a type error | Report it to us, and do not edit code |
| Gradle: "SDK location not found" | Open the `android` folder in Android Studio once (it creates `local.properties`) |
| Gradle: wrong Java version | Android Studio → Settings → Build Tools → Gradle → Gradle JDK = Android Studio's bundled **JetBrains Runtime (jbr)** |
| Xcode: package resolution error | **File → Packages → Reset Package Caches** |
