# Homebrew cask for Substrate. Lives in a tap repo (e.g. tylergibbs1/homebrew-tap
# as Casks/substrate.rb); users then run:
#   brew tap tylergibbs1/tap
#   brew install --cask substrate
#
# Bump `version` + `sha256` on each release (sha256 of the arm64 .dmg).
cask "substrate" do
  version "0.3.0"
  sha256 "18009fcaa2fcb19b60354bf61cc7d345758af670f673fa65833dbc5cb0e0d5f8"

  url "https://github.com/tylergibbs1/substrate/releases/download/v#{version}/Substrate-#{version}-arm64.dmg",
      verified: "github.com/tylergibbs1/substrate/"
  name "Substrate"
  desc "Desktop app for AI-generated raster slide decks (the prompt is the only editable artifact)"
  homepage "https://github.com/tylergibbs1/substrate"

  # Apple Silicon only for now (the release ships an arm64 build).
  depends_on arch: :arm64

  app "Substrate.app"

  zap trash: [
    "~/Library/Application Support/substrate",
  ]

  caveats <<~EOS
    Substrate is not yet code-signed or notarized, so macOS Gatekeeper will block
    the first launch. Either right-click the app and choose Open, or run:

      xattr -dr com.apple.quarantine "/Applications/Substrate.app"

    Once the app is signed + notarized this caveat (and the manual step) go away.
  EOS
end
