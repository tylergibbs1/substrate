# Packaging / distribution

Drafts for the two package-registry channels (on top of the GitHub Release that
`.github/workflows/release.yml` publishes). Both reference the **v0.3.4**
artifacts; bump the version + SHA256 on each release.

## Homebrew (macOS)

`homebrew/substrate.rb` is a cask. It lives in a **tap repo**, not the app repo:

1. Create a tap repo named `tylergibbs1/homebrew-tap` (the `homebrew-` prefix is
   required).
2. Copy `homebrew/substrate.rb` into it as `Casks/substrate.rb`.
3. Users install with:
   ```sh
   brew tap tylergibbs1/tap
   brew install --cask substrate
   ```

Per release: update `version` and `sha256` (sha256 of the arm64 `.dmg`):
```sh
shasum -a 256 Substrate-<v>-arm64.dmg
```

## winget (Windows)

`winget/` holds the three manifest files. Submit them as a PR to
[microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) under
`manifests/t/Tylergibbs1/Substrate/<version>/`.

Easiest path is the official tool:
```sh
winget install wingetcreate
wingetcreate update Tylergibbs1.Substrate --version 0.3.4 \
  --urls https://github.com/tylergibbs1/substrate/releases/download/v0.3.4/Substrate-Setup-0.3.4.exe \
  --submit
```
`wingetcreate` recomputes the SHA256 and opens the PR. To validate locally first:
`winget validate --manifest winget/`.

Per release: update `PackageVersion`, `InstallerUrl`, and `InstallerSha256`
(uppercase) in `Tylergibbs1.Substrate.installer.yaml`.

## Code signing + notarization

The release workflow signs automatically **when these repo secrets are set**
(Settings → Secrets and variables → Actions). Until then it builds unsigned and
still publishes — nothing else to change.

**macOS** — a Developer ID Application cert (the `.p12`) for signing:
- `MAC_CSC_LINK` — base64 of the exported `.p12`: `base64 -i cert.p12 | pbcopy`
- `MAC_CSC_KEY_PASSWORD` — the `.p12` export password

plus notarization auth — **either** an App Store Connect API key (preferred — no
2FA / app-specific password, the way CodexBar does it):
- `APPLE_API_KEY_P8` — the contents of the `.p8` key from App Store Connect
- `APPLE_API_KEY_ID` — the key's ID
- `APPLE_API_ISSUER` — the issuer UUID

**or** the Apple-ID fallback:
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

**Windows** (a code-signing `.pfx`, e.g. from an EV/OV cert or Azure Trusted Signing):
- `WIN_CSC_LINK` — base64 of the `.pfx`
- `WIN_CSC_KEY_PASSWORD` — the `.pfx` password

Signing also unlocks **auto-updates** — `electron-updater` is wired in
`apps/desktop/main.js` and checks the GitHub Release on launch, but macOS
(Squirrel.Mac) only updates a signed app.

## Before either is accepted

- **Add a `LICENSE` file** to the repo (the winget locale manifest references it
  and winget validation requires a license). The `License: MIT` in the manifest is
  a placeholder — set it to the real license.
- **Code-sign + notarize** the installers. winget's automated validation runs the
  installer in a sandbox and commonly rejects unsigned EXEs; Homebrew installs
  unsigned casks but users still hit Gatekeeper (see the cask `caveats`). Signing
  is the unblocker for clean acceptance on both channels.
