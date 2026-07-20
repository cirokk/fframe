# Fframe Uploader

🌐 [Português](README.md) · **[English](README.en.md)**

Android app that sends the videos recorded by **any camera app** to **your own server**, creating
a **proxy** version (lighter) on the device before uploading.

> 🌐 **Language:** the app's interface is **Portuguese only**. The server's web panel is bilingual
> (Portuguese and English, via a dropdown).

Works together with the [Fframe server](../server/README.en.md) (compatible with this app).

## Features

- 🫧 **Floating bubble** over any camera app (drag it to the **X** to close)
- 📷 **QR code pairing** — scan the QR from the panel and it's configured, no typing needed
- 🎞️ **On-device proxy**: 720 / 1080 LQ / 1080 HQ
- 🚦 Modes: **Automatic**, **Ask** (Ignore / Queue / Send), and **Off**
- 🗂️ **Native gallery**: projects, create/delete project, watch and delete videos
- 📥 **Queue**: defers processing; each video keeps its destination project
- 📊 Floating upload progress bar

## Setting up the app

On first open, tap **⚙** and pick one of two ways:

- **Pair by QR code** (recommended) — on the server panel, go to *Devices → Add device*, point
  the camera at the generated QR code, and the app fills in server + key on its own.
- **Manual** — fill in **Server address** and **Access key** (the device key shown in the panel)
  by hand.

Grant the **Draw over other apps** and **Video access** permissions, and turn the bubble on.

## Building

You need JDK 17 + Android SDK (build-tools 34, platform 34).

```bash
# signing (optional): copy and fill in
cp keystore.properties.example keystore.properties

./gradlew assembleRelease     # signed APK (if keystore.properties exists)
./gradlew assembleDebug       # debug APK
```

The APK is output to `app/build/outputs/apk/`.

## Security / privacy

No server address or key is embedded in the code — everything is configured by the user in the
app. The device key always goes in the `X-Device-Key` header (never in the query string, so it
doesn't leak into server/proxy logs). Automatic Android backup is disabled (`allowBackup=false`),
so the configuration doesn't leave the device in Google/adb backups. The signing key
(`keystore.properties`, `*.jks`) is **not** versioned.

## License

MIT
