# Builds the Chrome Web Store upload package from the extension runtime files.
# Excludes the bookmarklet dev artifacts (bookmarklet.js, build-bookmarklet.mjs,
# bookmarklet-url.txt), which are not part of the extension.
#
# Run:  pwsh extension/build-zip.ps1
# Output: build/mise-extension-<version>.zip  (upload this to the Web Store)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$repo = Split-Path $root -Parent
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

$stage = Join-Path $repo 'build/mise-extension'
$out = Join-Path $repo "build/mise-extension-$version.zip"

Remove-Item -Recurse -Force $stage, $out -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $stage | Out-Null

$runtimeFiles = @('manifest.json', 'background.js', 'content.js', 'popup.html', 'popup.js', 'nutrition.js')
foreach ($f in $runtimeFiles) { Copy-Item (Join-Path $root $f) (Join-Path $stage $f) }
Copy-Item (Join-Path $root 'icons') (Join-Path $stage 'icons') -Recurse

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $out -Force
Write-Output "Built $out ($([math]::Round((Get-Item $out).Length / 1KB, 1)) KB) for version $version"
