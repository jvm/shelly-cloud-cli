import { writeFileSync } from 'node:fs';

const [version, url, sha256, output = 'Formula/shelly-cloud-cli.rb'] = process.argv.slice(2);
if (!version || !url || !sha256) {
  console.error('usage: node scripts/homebrew-formula.mjs <version> <tarball-url> <sha256> [output]');
  process.exit(2);
}

const formula = `class ShellyCloudCli < Formula
  desc "Agent-native CLI for Shelly Cloud Control API v2"
  homepage "https://github.com/jvm/shelly-cloud-cli"
  url "${url}"
  sha256 "${sha256}"
  license "MIT"

  depends_on "node@20"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match "${version}", shell_output("#{bin}/shelly-cloud --version")
    assert_match "schema_version", shell_output("#{bin}/shelly-cloud agent-context --json")
  end
end
`;

writeFileSync(output, formula);
console.log(output);
