# GitHub Actions Workflows

This directory contains GitHub Actions workflows for building, testing, and releasing KickTalk.

## Workflows

### 🔨 `build.yml` - Main Build & Release
**Triggers:** Push to main/develop, tags, PRs, manual dispatch

- Builds for all platforms (Windows, macOS, Linux) 
- Uploads build artifacts
- Creates releases for tagged versions
- Matrix strategy for cross-platform builds

### 🚀 `release.yml` - Manual Release Creation
**Triggers:** Manual workflow dispatch

- Allows manual version bumping
- Creates git tags automatically
- Builds all platforms
- Creates well-formatted GitHub releases
- Supports draft and pre-release options

### ✅ `ci.yml` - Continuous Integration  
**Triggers:** PRs and pushes to main/develop

- Runs linting and build tests
- Tests builds on all platforms
- Fast feedback for PRs
- No artifact uploads (CI only)

### 🪟 `build-windows.yml` - Windows-only Build
**Triggers:** Manual workflow dispatch

- Fast Windows-only builds for testing
- Optional artifact upload
- Useful for quick Windows testing

## Usage

### Creating a Release

1. **Automatic (Recommended):**
   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```
   This triggers the main build workflow and creates a release.

2. **Manual Release:**
   - Go to Actions → "Manual Release"
   - Click "Run workflow"
   - Enter version number (e.g., `1.2.0`)
   - Choose draft/prerelease options
   - This will bump version, create tag, and build

### Testing Builds

- **All Platforms:** Push to main/develop or create PR
- **Windows Only:** Use "Build Windows" workflow manually
- **Local Testing:** Use npm scripts like `npm run build:win`

## Build Artifacts

### Windows
- `kicktalk-{version}-setup.exe` - NSIS installer
- `kicktalk-{version}-setup.exe.blockmap` - Update verification

### macOS  
- `kicktalk-{version}.dmg` - Intel Macs
- `kicktalk-{version}-arm64.dmg` - Apple Silicon (M1/M2/M3)
- `.zip` files for auto-updates

### Linux
- `kicktalk-{version}.AppImage` - Universal (recommended)
- `kicktalk_{version}_amd64.deb` - Debian/Ubuntu
- `kicktalk_{version}_amd64.snap` - Snap package

## Environment Variables & Secrets

The workflows use these GitHub secrets (configure in repository settings):

- `GITHUB_TOKEN` - Automatically provided, used for releases
- `APPLE_ID` - (Optional) Apple ID for macOS notarization  
- `APPLE_APP_SPECIFIC_PASSWORD` - (Optional) App-specific password
- `CSC_LINK` - (Optional) Code signing certificate
- `CSC_KEY_PASSWORD` - (Optional) Certificate password

## Local Development

### Build Commands
```bash
# Build for current platform
npm run build:win      # Windows
npm run build:mac      # macOS  
npm run build:linux    # Linux

# Build all platforms (requires Docker for cross-platform)
npm run build:all

# Build without publishing
npm run dist:win

# Test build (unpackaged)
npm run build:unpack
```

### Testing Before Release
1. Create a PR to test CI workflows
2. Use manual "Build Windows" workflow for quick testing
3. Test locally with `npm run build:unpack`

## Troubleshooting

### Build Failures
- Check Node.js version (workflow uses Node 20)
- Verify pnpm-lock.yaml is committed
- Check electron-builder.yml configuration
- Review build logs in Actions tab

### Release Issues  
- Ensure proper semver tags (v1.2.3)
- Check repository permissions
- Verify GITHUB_TOKEN has release permissions

### Cross-Platform Issues
- Windows: Requires Windows runner for native builds
- macOS: Separate runners for Intel (macos-13) and Apple Silicon (macos-latest)
- Linux: Uses Ubuntu 22.04 for compatibility

## Performance Notes

- Workflows use pnpm with caching for faster installs
- Artifacts are kept for 7-30 days depending on workflow
- Concurrent workflows are cancelled when new commits arrive
- Matrix builds run in parallel for speed