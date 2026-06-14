# Digital Asset Links — Android TWA Verification

This directory serves `assetlinks.json` at `/.well-known/assetlinks.json` from
the deployed site. Android reads it to confirm that your APK is allowed to
open this URL fullscreen without showing a Chrome address bar.

## Filling it in after PWABuilder

When you generate the APK on https://www.pwabuilder.com, the downloaded ZIP
contains its own `assetlinks.json` (look under the `next-steps` or root of
the zip). Open it and copy two values into `assetlinks.json` here:

1. **`package_name`** — usually `app.leadboard.twa` or similar. Replace
   `REPLACE_ME_WITH_PACKAGE_NAME`.
2. **`sha256_cert_fingerprints[0]`** — the long colon-separated string,
   e.g. `AB:CD:12:...:EF`. Replace `REPLACE_ME_WITH_SHA256_FINGERPRINT_FROM_PWABUILDER`.

Then commit + push. Vercel redeploys, the live URL serves the populated file,
and Android will trust the APK on its next launch (no URL bar shown).

## How to verify after deploy

```bash
curl https://lead-managment-v1.vercel.app/.well-known/assetlinks.json
```

You should see your filled-in JSON. If you see the placeholders, you forgot
to update.

## Adding more APKs later

If you ever regenerate the APK (e.g. icon change), the SHA fingerprint
stays the same as long as you keep the same `signing.keystore` from the
original PWABuilder download. Hold onto that file + its password — without
it, regenerating means a new fingerprint and re-issuing the file here.
