# Building the NutriSLM Android APK

The sandbox that develops NutriSLM has **no Android SDK**, so the APK is not compiled
there. This guide gives you two proven ways to get an installable Android app.
Both take ~10–20 minutes on any normal machine.

> **Important:** NutriSLM is a full-stack app (Next.js API routes + SQLite database).
> An APK is only a *shell* — it needs your running NutriSLM server to talk to
> (`/api/nutrition/*`, auth, etc.). Decide first how you'll host the server:
>
> - **On your PC** (`bun run dev`) → phone connects over Wi-Fi via your LAN IP
> - **A real host** (VPS, Vercel+Postgres, Railway, Fly.io…) → use that URL

---

## Option A — PWABuilder (easiest, no Android Studio) ✅ recommended

NutriSLM is already a complete **PWA** (manifest + icons + service worker are built in).
PWABuilder turns a hosted PWA into a signed APK/AAB automatically.

1. Host the app anywhere reachable (e.g. your PC + a tunnel, or a VPS).
2. Open <https://www.pwabuilder.com> and paste your app's **public URL**.
3. Click **Package for stores → Android**.
4. Download the zip — it contains:
   - `app-release-signed.apk` ← install this directly on any Android phone
   - `app-release-bundle.aab` (Play Store upload)
   - `signing-report`, test instructions
5. Transfer the APK to your phone and open it (allow "install unknown apps" when prompted).

**No coding, no toolchain — the APK wraps your live NutriSLM site.**

---

## Option B — Capacitor + Android Studio (full control)

### Prerequisites (one-time)

- [Node.js 18+](https://nodejs.org) and Java JDK 17 (Android Studio bundles one)
- [Android Studio](https://developer.android.com/studio) (installs SDK 34+ automatically)

### Steps

```bash
# 1. From the project root — install Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. capacitor.config.ts (already in the project root) —
#    edit server.url to your running server, e.g.:
#      url: "http://192.168.1.20:3000"   ← your PC's LAN IP, phone on same Wi-Fi

# 3. Generate the native Android project
npx cap add android

# 4. Sync (copies config + icons; safe to re-run anytime)
npx cap sync android

# 5a. Build from the command line (debug APK)
cd android && ./gradlew assembleDebug
#    → android/app/build/outputs/apk/debug/app-debug.apk

# 5b. …or open Android Studio and use Build ▸ Build APK(s) / Generate Signed Bundle
npx cap open android
```

### Release (Play Store / clean install)

```bash
keytool -genkey -v -keystore nutrislm.keystore -alias nutrislm -keyalg RSA -keysize 2048 -validity 10000
cd android && ./gradlew assembleRelease
# sign with apksigner or configure signingConfigs in android/app/build.gradle
```

### App icon

Replace the icons in `android/app/src/main/res/mipmap-*` (or run
`npx @capacitor/assets generate --iconBackgroundColor '#059669'` with
`assets/icon.png` + `assets/icon-foreground.png` placed in the project root).

---

## What about the iPhone?

The same PWA installs on iOS without any build step: open the site in **Safari →
Share → Add to Home Screen**. (iOS APKs don't exist; native iOS would need Xcode.)

---

## Why not bundle the whole app inside the APK?

The nutrition engine (constraint checking, targets, goals, AI parsing) runs on the
server by design — *AI understands, the database answers, deterministic code
calculates*. A WebView APK that bundles only static files would have no backend.
Always point the shell at a live server URL.
