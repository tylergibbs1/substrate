# Code signing + notarization setup

With an active Apple Developer membership, signing + notarization turn on by
adding repo secrets — the release workflow (`.github/workflows/release.yml`) is
already wired to use them. No code changes; the next `pnpm release` ships a
signed, notarized, auto-updating macOS build.

## 1. Developer ID Application certificate (signing)

The cert that signs the `.app`. Easiest via Xcode:

1. Xcode → Settings → Accounts → select your team → **Manage Certificates…**
2. **+** → **Developer ID Application**. It lands in your login keychain as
   `Developer ID Application: <Name> (TEAMID)`.
3. Keychain Access → find that cert → expand it → select the cert **and** its
   private key → right-click → **Export 2 items…** → save `DeveloperID.p12` with
   a password.
4. Base64 it for the secret:
   ```sh
   base64 -i DeveloperID.p12 | pbcopy
   ```

(No Xcode? developer.apple.com → Certificates → **+** → Developer ID Application,
upload a CSR from Keychain Access → Certificate Assistant → Request a Certificate.)

## 2. App Store Connect API key (notarization)

The clean, password-free notarytool auth (CodexBar's approach):

1. appstoreconnect.apple.com → **Users and Access** → **Integrations** →
   **App Store Connect API** → **Team Keys** → **+**.
2. Name it (e.g. "Substrate CI"), access **Developer** (or App Manager), generate.
3. **Download the `.p8` now** (one-time). Note the **Key ID** and, at the top of
   the page, the **Issuer ID** (a UUID).

## 3. Add the GitHub repo secrets

Settings → Secrets and variables → Actions → New repository secret — or with `gh`
(run these yourself; they carry your private key material):

```sh
gh secret set MAC_CSC_LINK < <(base64 -i DeveloperID.p12)
gh secret set MAC_CSC_KEY_PASSWORD          # paste the .p12 password
gh secret set APPLE_API_KEY_P8 < AuthKey_XXXXXXXXXX.p8
gh secret set APPLE_API_KEY_ID  --body "XXXXXXXXXX"      # the Key ID
gh secret set APPLE_API_ISSUER  --body "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Windows signing is independent and optional: `WIN_CSC_LINK` (base64 `.pfx`) +
`WIN_CSC_KEY_PASSWORD`.

## 4. Release

```sh
pnpm release 0.3.3
```

The macOS job now signs with the Developer ID, notarizes via the API key, and
staples the ticket — the download opens with no Gatekeeper warning, and
electron-updater auto-updates work. Nothing changes for Linux/Windows.

To confirm a build is notarized:
```sh
spctl -a -vvv /Applications/Substrate.app     # → "accepted, source=Notarized Developer ID"
```

---

# Windows code signing (kill the SmartScreen warning)

The Windows `.exe` is currently **unsigned**, so the first run shows SmartScreen's
"Windows protected your PC" prompt (users click **More info → Run anyway**). The
release workflow already reads `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` (the same
shape as the Mac path) — set them and the next `pnpm release` ships a signed
installer. No code changes.

## 1. Get a code-signing certificate

From a CA (DigiCert, Sectigo, SSL.com, …). Two tiers:

- **OV (Organization Validation)** — ~$200–400/yr. Signs the binary; SmartScreen
  reputation accrues over downloads/time, so the warning fades rather than
  vanishing on day one.
- **EV (Extended Validation)** — pricier, grants **instant** SmartScreen
  reputation (no warning from the first download).

You'll receive a `.pfx` (PKCS#12) + its password.

> EV certs now ship on a hardware token or cloud HSM and **cannot be exported to
> a `.pfx`**, so they don't drop into `WIN_CSC_LINK` — they need cloud signing
> (Azure Trusted Signing, SSL.com eSigner, etc.) wired as a custom sign step.
> **OV is the turn-key path for this CI.** Start there unless you need day-one
> zero-warning.

## 2. Base64 the .pfx + set the secrets

```sh
base64 -i Substrate.pfx | pbcopy          # macOS  (Linux: base64 -w0 Substrate.pfx)
gh secret set WIN_CSC_LINK                 # paste the base64
gh secret set WIN_CSC_KEY_PASSWORD         # the .pfx password
```

(Run these yourself — they carry private key material.)

## 3. Release

`pnpm release X.Y.Z` — the Windows job signs the NSIS installer with the cert and
timestamps the signature (so it stays valid after the cert expires). macOS/Linux
are unaffected. Confirm on Windows:

```powershell
Get-AuthenticodeSignature .\Substrate-Setup-X.Y.Z.exe   # Status → Valid
```

Then refresh the winget manifest's `InstallerSha256` for the new signed `.exe`.
