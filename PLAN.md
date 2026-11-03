# Project Atlas implementation plan

## Product decisions

An Electron desktop application with a React/TypeScript renderer. All project data stays on the device. Support GitHub.com and GitHub Enterprise from the first release. Closing the window keeps monitoring running in a system tray; Quit stops it. Default styling: navy, teal, and violet, approved by the user.

## First implementation

1. Establish the Electron security boundary, typed preload API, local storage, and versioned data validation.
2. Build a polished dark overview: online/offline/unknown metrics, project cards, repository activity, open PRs, search, and watch/status filters. Provide an explicitly labeled optional demo workspace.
3. Add/edit projects with repository URL, deployment URL, client, personal contribution notes, technologies, and independent uptime/repository/notification preferences.
4. Connect GitHub.com and Enterprise with host-specific personal access tokens encrypted using the OS credential facility. Explain SAML SSO authorization and show actionable API access errors. Automatically detect repository languages and list activity and open PRs.
5. Poll watched deployments and repositories in the Electron main process, retain bounded activity, notify on status transitions and new PRs, and keep running through the system tray.
6. Add validated JSON import/export excluding credentials, account settings, and local deletion.
7. Verify production compilation and core validation/monitoring behavior; document setup, auth, and operational limitations.

## Added requirements

- Website-only projects are supported. Loss of repository access preserves historical logs and PR snapshots while removing authenticated actions.
- Show an expiration countdown and orange hourglass within a configurable per-project warning period. GitHub-reported token expiration is authoritative; manual SAML reauthentication dates and intervals are explicitly estimates. Show the expected reauthentication frequency in project details.

## Acceptance checks

- Add a repository and deployment URL, then see real monitoring results and repository languages.
- Search/filter projects and restrict activity/PRs to watched projects.
- Preserve notes/preferences across restarts; import/export round trips without secrets.
- Support custom HTTPS Enterprise hosts and report SSO authorization requirements.
- Closing the window keeps the app alive; tray Open restores it and Quit exits.
- Failed GitHub access does not mark the deployment offline; initial PR fetch does not spam notifications.

## Later

OAuth/device authorization, configurable monitoring schedules, encrypted peer-to-peer device sync with conflict resolution. Monitoring requires a running device and an active network connection.

## Local vulnerability monitoring (requested addition)

- Maintain an exact-version dependency inventory per project, including npm, NuGet, Maven/Java, other package ecosystems, CMSs and plugins. Import lockfiles or SPDX/CycloneDX JSON; refresh supported files from GitHub while access exists and retain the last inventory after access ends.
- Download public GitHub advisory updates and the NVD modified JSON feed without transmitting project/package inventories. Match locally on an hourly main-process job, including while the window is hidden.
- Store source timestamps, cache coverage, errors, advisory links, CVSS/severity, and deduplicated notifications. Initial feeds cover recent disclosures rather than claiming a complete historical audit; allow local feed imports to expand coverage.
- Match npm ranges with semver; match simple stable numeric ranges in other ecosystems conservatively. Unsupported version syntax and conditional CPE applicability require review rather than a false all-clear.
- CMS defaults are WordPress, Shopify, Wix, Squarespace and Joomla, based on W3Techs on 2026-11-02. Hosted SaaS versions may be unavailable; presets do not imply complete CVE coverage. WordPress plugins need an exact package identity or CPE mapping.
- No external audit execution, source builds, hosted scanning service, OSV queries, or package uploads. No RSS scraping when structured advisory feeds are available.

## Startup requirements (requested addition)

- Run a local desktop readiness check at startup; list missing/unavailable capabilities with practical remediation and a **Check again** button. Keep the result accessible after successful checks.
- Check writable workspace storage, the bundled Electron/Node runtime, the secure credential store, notification support, and optional Git availability. Git is not required by the current GitHub REST implementation; neither Java nor .NET SDKs are needed to read inventories.
- Check source-checkout prerequisites before launch (Node, installed npm packages, Electron binary, and production renderer). Provide terminal retry when a missing runtime or Linux sandbox prevents a window from opening.
- Keep checks local and read-only except a temporary storage write/read probe. Do not install tools, alter system permissions, disable sandboxing, or make network requests during readiness checks.

## Appearance (requested addition)

- Preserve the original Atlas theme and add Hacker (green terminal), Elegant (light refined desktop), and Retro (Windows 95-inspired) palettes using custom CSS and the same UX.
- Default to Elegant on Mac and Atlas on Windows/Linux when there is no saved choice. An explicit theme choice persists locally and takes priority over platform detection.
- Keep appearance controls available in settings and verify platform defaults, switching, and persistence.

## Native installation and distribution

- Build native Windows NSIS installers, macOS DMG/ZIP, Debian DEB, Fedora RPM, Arch pacman packages, and AppImage. Bundle the runtime and installed dependencies so end users do not need Node.js, npm, Git, Java, or .NET SDKs.
- Add native platform build jobs for x64 and arm64 with downloadable artifacts, with update metadata and signed main-release publication after all jobs succeed. Windows/macOS public distribution needs the appropriate signing credentials; keep unsigned review builds clearly documented.
- Preserve the existing workspace directory across source and installed builds. Include desktop/menu integration and retain user data on uninstall.
- Preserve Chromium sandboxing, including in AppImage. Verify the actual generated Linux package metadata and launcher. Build and inspect artifacts before requesting any system installation.

## Main-branch updates

- Installed builds check the GitHub main release channel at startup and hourly. Show an update banner with user-controlled download, progress, retry, and explicit restart/install. Development checkouts stay unchanged.
- Use electron-updater for version selection, checksums, platform verification, and downloads. Native Linux installs use explicit Polkit elevation without disabling package verification or refreshing Arch package databases independently.
- Main builds get monotonic prerelease versions. Publish the release only after all platform artifacts upload successfully; signing/notarization credentials gate automatic main publication. Retain user data and flush local writes before installation.

## Repository access and diagnostics

- Include optional, local token availability checks for GitHub.com and configured Enterprise hosts in startup diagnostics. Allow token setup directly in the checklist, with host-specific token settings links; Settings is optional. Stored credentials are not proof of repository permission.
- Link to current GitHub SSO authorization documentation. Public repositories may be monitored anonymously; distinguish repository monitoring from website health.

- Parse bounded npm, Composer, NuGet, Maven/Gradle, Python, Rust, Go, Ruby and Docker manifests on device, with GitHub URL previews and an optional selected-folder scan. No AI or project execution.
