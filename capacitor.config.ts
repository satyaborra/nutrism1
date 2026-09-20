/**
 * Capacitor configuration for building the NutriSLM Android app (APK/AAB).
 * Plain object (no @capacitor/cli type import) so it typechecks before you
 * install the Capacitor packages — Capacitor reads it as-is.
 *
 * NutriSLM is a FULL-STACK app (Next.js API routes + SQLite), so the Android
 * shell loads your deployed server URL instead of bundling static files.
 *
 * 1. Deploy the web app (or run it on your PC: `bun run dev`).
 * 2. Set `server.url` below to your server address — use your LAN IP
 *    (e.g. "http://192.168.1.20:3000") when testing from a phone.
 * 3. Follow android-apk/ANDROID-APK-GUIDE.md to produce the APK.
 */
const config = {
  appId: "app.nutrislm.mobile",
  appName: "NutriSLM",
  webDir: "public",
  server: {
    // REQUIRED: point this at your running NutriSLM server before building.
    // Examples: "http://192.168.1.20:3000" (LAN dev) or "https://your-domain.com" (production).
    url: "http://localhost:3000",
    cleartext: true, // allow http:// for LAN testing; remove for production HTTPS-only
  },
  android: {
    backgroundColor: "#eef2e6",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#059669",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;
