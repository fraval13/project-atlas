# Validation — 2026-11-02

- `npm test`: 44 checks pass (10 project/monitoring/expiry, 15 inventory/advisory/feed, 1 Electron IPC integration harness, 7 startup requirement checks, 4 packaging checks, 7 update lifecycle checks).
- `npm run build`: TypeScript checking and production Vite compilation pass.
- `npm run test:ui`: 9 browser flows pass: filtering and countdown display; website-only controls; preserved historical access; adding projects through the preload bridge; security ratings and all requested CMS presets; startup diagnosis and refresh; theme switching/persistence; Mac default and saved-choice priority; explicit update download and restart.
- `npm run verify:feeds`: Live unauthenticated downloads from GitHub global advisories and NVD both returned ready. The verification run downloaded 18,663 records (including 18,661 NVD records) and verified NVD's SHA-256 checksum. This check sends no inventory or repository credentials and does not save the downloaded cache.
- Runtime dependency audit reported zero known vulnerabilities. The packaging development toolchain reports moderate advisories.

Native Electron startup was attempted. This host blocks unprivileged user namespaces and the downloaded Electron setuid helper is not configured with system installation permissions. Chromium aborts before the application window starts. No system security policy was changed and no sandbox-disabling flag was added to the app. The launcher detects this failure and prints repair/retry instructions. Window-to-tray, restore, and quit logic is covered by the mocked Electron IPC harness; actual tray, notification, and system keyring behavior still needs validation on a configured desktop.

Private GitHub.com/Enterprise repositories, organization-specific SAML policies, notifications, and secure credential storage require live user credentials and environment verification. Automatic inventory discovery is bounded and incomplete for unsupported manifests; Java builds should supply a resolved SBOM. CVE matching uses the cached disclosure window and reports unsupported versions for review rather than claiming exhaustive vulnerability coverage.

Screenshots contain clearly labeled sample data: overview.png, project-details.png, security.png.

Linux x64 artifacts were built for Debian, Fedora, Arch, and AppImage using an isolated Debian container with native packaging tools. Metadata, update manifest entries, and checksums were inspected. Native Windows/macOS installers and ARM64 artifacts are configured in GitHub Actions and require those platform runners. Signing/notarization credentials and a publicly accessible release feed are needed before automatic main releases can be offered to installed clients. The packages have not been installed on the host system. Temporary Docker build containers and the task-downloaded image have been removed.
