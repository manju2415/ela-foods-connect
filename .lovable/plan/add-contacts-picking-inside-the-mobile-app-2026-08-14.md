# Add contacts picking inside the mobile app

## Current state

The "Invite Friends & Family" dialog already has a "From contacts" button, but it only appears when the browser exposes the Contact Picker API (Chrome on Android in a normal browser tab). Inside the installed APK and on iOS/desktop the button is hidden, so contacts can't be picked there.

## What will change

- Add the Capacitor Contacts plugin so the installed app can open the phone's real contact list.
- The "From contacts" button becomes:
  - Installed app: asks for contacts permission once, then opens a searchable list of the phone's contacts; picking one fills in the name and number.
  - Chrome on Android (web): keeps the existing browser picker.
  - Anywhere else (iOS Safari, desktop): button stays hidden, manual entry as today.
- Selected number is cleaned to the last 10 digits and validated, name is auto-filled; if permission is denied a clear message explains how to enable it.
- Android manifest gets the contacts read permission; iOS gets the contacts usage description string.

## Technical notes

- Add `@capacitor-community/contacts`; gate usage behind `Capacitor.isNativePlatform()`.
- New helper `src/lib/contacts.ts` exposing `isContactPickerAvailable()` and `pickContact()` that resolves native vs web path and returns `{ name, phone }`.
- Update `src/components/AddUserDialog.tsx` to use that helper instead of the inline `navigator.contacts` code.
- Native contact list rendered in a simple searchable dialog (plugin returns contacts; no native UI picker on Android).

## After this change

A fresh APK build is needed for the native picker to work: pull the project, run `npm install`, `npx cap sync`, then rebuild the app. The web behaviour updates immediately.
