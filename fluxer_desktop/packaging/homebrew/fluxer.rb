cask "fluxer" do
  arch arm: "arm64", intel: "x64"

  version "PLACEHOLDER_VERSION"

  on_arm do
    sha256 "PLACEHOLDER_SHA256_ARM64"
  end
  on_intel do
    sha256 "PLACEHOLDER_SHA256_X64"
  end

  url "https://api.rdchat.ru/dl/desktop/stable/darwin/#{arch}/#{version}/dmg"
  name "Fluxer"
  desc "Instant messaging and VoIP application"
  homepage "https://rdchat.ru"

  livecheck do
    url "https://api.rdchat.ru/dl/desktop/stable/darwin/arm64/latest"
    strategy :json do |json|
      json["version"]
    end
  end

  auto_updates true
  depends_on macos: ">= :catalina"

  app "rdchat.ru"

  zap trash: [
    "~/Library/Application Support/Fluxer",
    "~/Library/Caches/app.fluxer",
    "~/Library/Caches/app.fluxer.ShipIt",
    "~/Library/Preferences/app.fluxer.plist",
    "~/Library/Saved Application State/app.fluxer.savedState",
  ]
end
