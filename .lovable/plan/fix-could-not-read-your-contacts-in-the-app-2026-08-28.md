# Fix "Could not read your contacts" in the app

## What's happening

The Add User screen opens an in-app contact list that reads your whole address book. That read needs the Android **READ_CONTACTS** permission declared in the app's native manifest. When it isn't declared (or was denied), the plugin call fails immediately and the dialog shows the generic "Could not read your contacts" message with 0 contacts — exactly what your screenshot shows.

The native Android project isn't part of this codebase (it lives in your local Capacitor build), so the permission must be present there for the full-list picker to ever work.

## Fix

1. **Fall back to the system contact picker.** Android's built-in picker requires no permission at all. When reading the full address book fails, the dialog will automatically open the OS "choose a contact" screen instead of showing a dead end. Selecting a contact fills name + number as before.
2. **Better error handling.** Distinguish "permission denied" from "permission not available in this build", and show a short, actionable message with two buttons: *Pick from phone* (system picker) and *Enter manually*.
3. **Ask for permission properly before reading**, and surface a "Open app settings" hint when permanently denied.
4. **Document the manifest requirement** so the next APK build includes it:
   `<uses-permission android:name="android.permission.READ_CONTACTS" />` in `android/app/src/main/AndroidManifest.xml`, added to MOBILE_BUILDS.md.

## Result

- Existing APK: tapping "Select from contacts" opens the phone's own contact chooser and works right away.
- Next APK build with the manifest permission: the full searchable list with "already registered" badges works as designed.

## Technical notes

- `src/lib/contacts.ts`: classify errors (denied vs unavailable), keep `pickContactNative` as the fallback path.
- `src/components/ContactPickerDialog.tsx`: on error state, render fallback actions instead of only "Try again".
- `src/components/AddUserDialog.tsx`: route the fallback selection into the same phone/name fields.
- No backend or business-logic changes.
