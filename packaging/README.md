# Packaging / distribution

Drafts for the two package-registry channels (on top of the GitHub Release that
`.github/workflows/release.yml` publishes). Both reference the **v0.3.0**
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
wingetcreate update Tylergibbs1.Substrate --version 0.3.0 \
  --urls https://github.com/tylergibbs1/substrate/releases/download/v0.3.0/Substrate-Setup-0.3.0.exe \
  --submit
```
`wingetcreate` recomputes the SHA256 and opens the PR. To validate locally first:
`winget validate --manifest winget/`.

Per release: update `PackageVersion`, `InstallerUrl`, and `InstallerSha256`
(uppercase) in `Tylergibbs1.Substrate.installer.yaml`.

## Before either is accepted

- **Add a `LICENSE` file** to the repo (the winget locale manifest references it
  and winget validation requires a license). The `License: MIT` in the manifest is
  a placeholder — set it to the real license.
- **Code-sign + notarize** the installers. winget's automated validation runs the
  installer in a sandbox and commonly rejects unsigned EXEs; Homebrew installs
  unsigned casks but users still hit Gatekeeper (see the cask `caveats`). Signing
  is the unblocker for clean acceptance on both channels.
