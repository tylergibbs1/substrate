# Homebrew cask for Substrate. Lives in a tap repo (e.g. tylergibbs1/homebrew-tap
# as Casks/substrate.rb); users then run:
#   brew tap tylergibbs1/tap
#   brew install --cask substrate
#
# Bump `version` + `sha256` on each release (sha256 of the arm64 .dmg).
cask "substrate" do
  version "0.3.4"
  sha256 "ad72e62e383c51795f04d799b76921ad8bbf3244ed1b2237916d11a680fc4297"

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
end
