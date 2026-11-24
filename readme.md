# Audiobookshelf Mobile App

> [!NOTE]
> **This is an unofficial fork** of [advplyr/audiobookshelf-app](https://github.com/advplyr/audiobookshelf-app), made to go with the server fork at [TheTerrasque/audiobookshelf](https://github.com/TheTerrasque/audiobookshelf). It's not affiliated with or supported by the Audiobookshelf project. For the official app, use the store links below. All fork changes are collected on the `fork` branch (the default branch here).

## Extra features

Most of these need the [server fork](https://github.com/TheTerrasque/audiobookshelf); with an official server the app works like the official one.

### Comics

- **Big comics open instantly.** Pages are streamed one at a time from the server instead of downloading and unpacking the whole archive on the phone. Downloaded comics, and servers without the fork, still use the original in-app unpacking.
- **Series in one book.** When a book has several comic files (one per volume, say), next/previous page carries on into the next file, and a file picker in the bottom bar jumps between them.
- **Resume in the right volume.** Reading progress remembers which file you were in, so the app and the web reader pick up in the same volume.
- **Change the file order.** **Reorder** in a book's Ebook Files list moves files up and down, so a series reads in the right order. Needs permission to update items.

### Epubs

- **Reliable page turning and progress.** Swiping turns exactly one page and progress is saved as you read. In the official app, swiping on a phone could bounce between chapters, land between pages, jump to 100% after a few pages and not save your place. This fix works with any server.

### Library

- **Filter by format.** The library filter has a **Format** option: Audiobook, Ebook or Comic.

### Audio

- **Choose which version of a book you hear.** When the server has other versions of a book (an M4B re-encode, a cleaned-up or sped-up copy), the item page shows a version picker. Your choice is saved on the server and used for streaming and new downloads, and your position carries over between versions.

- **Listen while a book downloads (Android).** A book with several audio files can be played as soon as its first files are downloaded; when you reach the end of what's on the phone, playback carries on into parts that finished downloading in the meantime. The item page shows how many parts are on the phone. To get this for a single-file book, have an admin split it into parts with the server fork's M4B encoder (**Split into parts**).
- **Free up space as you listen (Android).** **Delete heard parts** on the item page removes the downloaded parts that end before your position. The rest of the book keeps its place, and the files on the server are not touched.

### Connecting

- **Connect with a QR code.** In the server fork's web app, open **Account → Connect Mobile App**. Scan the QR code with the phone camera, or with **Scan QR Code** on the app's add-server screen, and the server address and your username are filled in; you only enter your password (or use SSO). The code never contains credentials. **Scan QR Code** also accepts a QR code that just holds a server address.

### Installing

- **Installs next to the official app.** It has its own app id and shows up as **ABS Fork** in the launcher.
- **Ready-to-install APKs.** Every push builds an Android APK, published as a pre-release under [Releases](https://github.com/TheTerrasque/audiobookshelf-app/releases) that you can download straight from your phone. From build 10 on, new builds install as updates over older ones; going from build 9 or earlier to a newer build needs one uninstall first. The version shows the build number (e.g. 0.14.2-beta.b10).

### Known limitations

- Progress synced through the offline/native progress sync doesn't record which comic file you were in.
- Both apps register the `audiobookshelf://` link scheme, so with both installed, SSO login and QR code links show an app chooser. Pick **ABS Fork**; the official app ignores QR code links.
- QR codes come from the server fork only; the official server has no **Connect Mobile App** button.
- Epub pages turn instantly, without the sliding animation of the official app.
- Listening while a book downloads: if you catch up with the download, playback stops at the end of the downloaded parts (press play again once the next part is in). Parts always download from the start of the book, even if you're further in. Android only.

<details>
<summary>Technical details</summary>

- **Comic pages:** uses the server fork's `GET /api/items/:id/ebook/:fileid?/pages[/:page]`. Per-file progress is sent as `ebookFileIno`. File order is saved with `PATCH /api/items/:id/ebook`.
- **Format filter:** `format.<audiobook|ebook|comic>` library filter from the server fork.
- **Epub reader:** uses epub.js's single-section (`default`) manager without touch snapping; swipes are handled by `Reader.vue` and call `next()`/`prev()`, and the scroll position is snapped to whole pages after each turn. The upstream `continuous` manager with `snap` let native touch scrolling fight with views being added and removed.
- **Versions:** `PATCH /api/me/item/:id/version` stores the choice on the server.
- **Partial downloads:** a downloaded book keeps the server's track offsets and full duration (`Book.keepTrackOffsets` in the local item), so tracks can be missing without shifting the timeline. After each audio file of a multi-file book is downloaded, `DownloadItemManager` saves the local item with the files done so far (up to the first one still missing) and emits `onDownloadItemPartsReady`. At the end of the local files, `PlayerNotificationService` reloads the local item and continues if more files are there. Deleting a track no longer renumbers the rest for these books. Local items downloaded before this change are unaffected.
- **Quick connect links:** `audiobookshelf://connect?address=<server url>&username=<username>`, handled in `plugins/init.client.js` and `components/connection/ServerConnectForm.vue`. Scanning uses `@capacitor-mlkit/barcode-scanning`: Google's code scanner on Android (downloaded by Play services the first time, no camera permission) and the camera on iOS.
- **App id:** `io.github.theterrasque.audiobookshelf` (debug builds add `.debug`).
- **APK signing:** `.github/workflows/build-apk.yml` decodes the `DEBUG_KEYSTORE_BASE64` repository secret (a base64 PKCS12 keystore, alias `androiddebugkey`, passwords `android`) and passes it to Gradle as `DEBUG_KEYSTORE_FILE`; `android/app/build.gradle` signs debug builds with it, and the workflow fails if the APK ends up signed with another key. Without the secret each build gets a random key and won't install over the previous one. Version codes are `100000 + run number`.

</details>

Audiobookshelf is a self-hosted audiobook and podcast server.

### Android (beta)

Get the Android app on the [Google Play Store](https://play.google.com/store/apps/details?id=com.audiobookshelf.app)

### iOS (early beta)

**Beta is currently full. Apple has a hard limit of 10k beta testers. Updates will be posted in Discord.**

Using Test Flight: https://testflight.apple.com/join/wiic7QIW **_(beta is full)_**

---

[Go to the main project repo github.com/advplyr/audiobookshelf](https://github.com/advplyr/audiobookshelf) or the project site [audiobookshelf.org](https://audiobookshelf.org)

Join us on [discord](https://discord.gg/pJsjuNCKRq)

**Requires an Audiobookshelf server to connect with**

<img alt="Screenshot" src="https://github.com/advplyr/audiobookshelf-app/raw/master/screenshots/DeviceDemoScreens.png" />

## Contributing

This application is built using [NuxtJS](https://nuxtjs.org/) and [Capacitor](https://capacitorjs.com/) in order to run on both iOS and Android on the same code base.

### Localization

Thank you to [Weblate](https://hosted.weblate.org/engage/audiobookshelf/) for hosting our localization infrastructure pro-bono. If you want to see Audiobookshelf in your language, please help us localize. Additional information on helping with the translations [here](https://www.audiobookshelf.org/faq#how-do-i-help-with-translations). <a href="https://hosted.weblate.org/engage/audiobookshelf/"> <img src="https://hosted.weblate.org/widget/audiobookshelf/abs-mobile-app/horizontal-auto.svg" alt="Translation status" /> </a>

### Windows Environment Setup for Android

Required Software:

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/en/) (version 20)
- Code editor of choice([VSCode](https://code.visualstudio.com/download), etc)
- [Android Studio](https://developer.android.com/studio)
- [Android SDK](https://developer.android.com/studio)

<details>
<summary>Install the required software with <a href=(https://docs.microsoft.com/en-us/windows/package-manager/winget/#production-recommended)>winget</a></summary>

<p>
Note: This requires a PowerShell prompt with winget installed.  You should be able to copy and paste the code block to install.  If you use an elevated PowerShell prompt, UAC will not pop up during the installs.

```PowerShell
winget install -e --id Git.Git; `
winget install -e --id Microsoft.VisualStudioCode; `
winget install -e --id  Google.AndroidStudio; `
winget install -e --id OpenJS.NodeJS --version 20.11.0;
```

![](/screenshots/dev_setup_windows_winget.png)

</p>
</details>
<br>

Your Windows environment should now be set up and ready to proceed!

### Mac Environment Setup for Android

Required Software:

- [Android Studio](https://developer.android.com/studio)
- [Node.js](https://nodejs.org/en/) (version 20)
- [Cocoapods](https://guides.cocoapods.org/using/getting-started.html#installation)
- [Android SDK](https://developer.android.com/studio)

<details>
<summary>Install the required software with <a href=(https://brew.sh/)>homebrew</a></summary>

<p>

```zsh
brew install android-studio node cocoapods
```

</p>
</details>

### Start working on the Android app

Clone or fork the project from terminal or powershell and `cd` into the project directory.

Install the required node packages:

```shell
npm install
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_android_npm_install.png)

</details>
<br>

Generate static web app:

```shell
npm run generate
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_android_npm_run.png)

</details>
<br>

Copy web app into native android/ios folders:

```shell
npx cap sync
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_android_cap_sync.png)

</details>
<br>

Open Android Studio:

```shell
npx cap open android
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_cap_android.png)

</details>
<br>

Start coding!

After making changes to the JS layer you need to rebuild the nuxt pages and sync them to the native shells:

```shell
npm run sync
```

### Mac Environment Setup for iOS

Required Software:

- [Xcode](https://developer.apple.com/xcode/)
- [Node.js](https://nodejs.org/en/)
- [Cocoapods](https://guides.cocoapods.org/using/getting-started.html#installation)

### Start working on the iOS app

Clone or fork the project in the terminal and `cd` into the project directory.

Install the required node packages:

```shell
npm install
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_ios_npm_install.png)

</details>
<br>

Generate static web app:

```shell
npm run generate
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_ios_npm_generate.png)

</details>
<br>

Copy web app into native android/ios folders:

```shell
npx cap sync
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_ios_cap_sync.png)

</details>
<br>

Open Xcode:

```shell
npx cap open ios
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_ios_cap_open.png)

</details>
<br>

Start coding!

After making changes to the JS layer you need to rebuild the nuxt pages and sync them to the native shells:

```shell
npm run sync
```
