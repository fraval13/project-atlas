# Atlas

Atlas is a local desktop workspace for consultants to remember and monitor the projects they have worked on. The name comes from an atlas: a collection of maps. Here, the maps are your projects, contributions, technologies, websites, and repositories.

Use Atlas to keep a project notebook, check website availability, follow repository activity and pull requests, and match dependency inventories against public vulnerability advisories. Project data is stored on your device.

## Install a built package

Download [Atlas 0.1.7 Preview](https://github.com/fraval13/project-atlas/releases/tag/v0.1.7):

- [Windows installer — x64 and ARM64](https://github.com/fraval13/project-atlas/releases/download/v0.1.7/Atlas-0.1.7-windows-setup.exe)
- [Mac disk image — Intel and Apple Silicon](https://github.com/fraval13/project-atlas/releases/download/v0.1.7/Atlas-0.1.7-mac-universal.dmg)
- [Linux packages — Debian, Fedora, Arch, and AppImage](https://github.com/fraval13/project-atlas/releases/tag/v0.1.7)

Expand **Assets → Show all assets** on the release page to see every package. These are preview installers; Windows/macOS trust warnings may appear.

Installers include the application runtime. Node.js, npm, and Git are optional for installed copies. Use the package matching your operating system and CPU architecture; a desktop environment and OS libraries are still needed.

| System          | Package        | Installation                                         |
| --------------- | -------------- | ---------------------------------------------------- |
| Windows         | `.exe`         | Open the setup wizard; it adds a Start menu shortcut |
| macOS           | `.dmg`         | Open the disk image and drag Atlas into Applications |
| Debian / Ubuntu | `.deb`         | Install with `apt`                                   |
| Fedora          | `.rpm`         | Install with `dnf`                                   |
| Arch Linux      | `.pkg.tar.zst` | Install with `pacman`                                |
| Portable Linux  | `.AppImage`    | Mark executable and run                              |

With the downloaded package in your current directory, these are the x64 commands for version 0.1.7. Replace the filename when installing another version or architecture.

```sh
# Arch Linux
sudo pacman -U ./Atlas-0.1.7-linux-x64.pkg.tar.zst

# Debian / Ubuntu
sudo apt install ./Atlas-0.1.7-linux-amd64.deb

# Fedora
sudo dnf install ./Atlas-0.1.7-linux-x86_64.rpm

# AppImage
chmod +x ./Atlas-0.1.7-linux-x86_64.AppImage && ./Atlas-0.1.7-linux-x86_64.AppImage
```

The native Linux packages declare system-library and Polkit dependencies and register Atlas in the application menu. A secure keyring is needed to save GitHub credentials. GNOME desktops may need an AppIndicator extension for tray visibility. AppImage requires a system that permits Chromium's user-namespace sandbox; native packages are preferable on systems with restrictive sandbox policies.

Package builds produce `release/SHA256SUMS.txt` via `node scripts/checksums.cjs`. Signed Windows/macOS packages need the signing setup described below. Unsigned review builds can trigger OS trust warnings.

## Run from source

You need Node.js 24+, npm, and a desktop environment.

```sh
npm install
npm run doctor
npm run dev
```

For a production build:

```sh
npm run build
npm start
```

The launcher checks installed project packages, the Electron runtime, and the production interface when applicable. If something is missing, it lists the problem and the command or setup needed to fix it. In an interactive terminal, press Enter to check again after fixing the problem.

**Git is optional.** GitHub connections use the REST API. Reading dependency inventories also works independently of locally installed Java or .NET SDKs.

For a browser design preview, run `npm run preview` and open the displayed local address. The browser preview uses labeled sample projects; use Electron for your actual workspace.

## Startup checks

Atlas checks its bundled runtime, local storage access, secure credential store, desktop notification support, and Git availability when the window opens. Missing capabilities appear with instructions. Click **Check again** after resolving them; expand the startup summary to review successful checks too.

Required storage problems protect the saved workspace from writes until it can be loaded. Optional capabilities are identified separately: for example, an unavailable secure credential store prevents saving GitHub tokens while website monitoring and local advisory matching remain usable.

On Linux, GitHub credentials need an unlocked system keyring such as GNOME Keyring or KWallet. After changing the keyring backend, restart Atlas if the OS requires it. Desktop notification preferences are controlled by the operating system.

If Electron cannot open because of its Linux sandbox, the launcher explains the problem and offers a retry. Have your system administrator configure the Electron sandbox helper or an appropriate AppArmor policy. The application runs with sandboxing and context isolation enabled.

## Appearance

Choose a theme in **Settings & connections → Appearance**:

| Theme   | Style                                                                   |
| ------- | ----------------------------------------------------------------------- |
| Atlas   | Dark navy surfaces with teal and violet accents                         |
| Hacker  | A terminal-inspired, monospace interface with matrix green text         |
| Elegant | Light surfaces, soft corners, and refined details                       |
| Retro   | Windows 95-inspired gray controls, beveled borders, and blue title bars |

Elegant is the default on Mac. Atlas is the default on Windows and Linux. Selecting a theme saves your choice on the device and overrides the platform default. All themes share the same layout and functionality.

## Add a project

1. Click **Add project** and enter its name and client.
2. Add a website URL, a GitHub repository URL, or both.
3. Record your contribution and technologies.
4. Select which website, repository, vulnerability, and notification checks to enable.

GitHub languages and locally parsed manifests supplement your technology list. Entering or editing a full repository URL automatically fetches repository languages and manifests from the configured GitHub host, parses them on device, and saves the detected technologies separately from your manual list. Saving starts the enabled monitoring checks immediately. Use **Refresh project** in project details to update website and repository information, refresh the dependency inventory, and recalculate CVE findings for that project. You can also scan a selected local folder. Supported manifests include npm, Composer, NuGet, Maven/Gradle, Python, Rust, Go, Ruby, and Docker. Detection uses explicit rules rather than AI, does not execute project files, and is bounded to 80 manifests (1 MB each). Unrecognized packages are not evidence that a technology is absent. Search and project/status filters apply to the overview, timeline, and pull requests.

Closing the window keeps Atlas running in the system tray. Use **Open Project Atlas** to restore it and **Quit** to stop monitoring. Some Linux desktops need a tray extension.

Website checks run every minute; repository checks run every five minutes. Manual refresh checks immediately. Refresh controls are disabled while a sync or another operation is running; hover or focus the control for an explanation. Successful HTTP responses count as online. HTTP errors count as offline, except access restrictions such as 401/403, which are unknown. Network, VPN, DNS, and timeout failures are also shown as unknown. Desktop notifications report status transitions and newly observed pull requests after the initial snapshot.

## Connect GitHub

A short guide beside both token fields lists the required read permissions and explains repository selection and organization approval. Connect directly from the startup checklist, or open **Settings & connections** and enter `github.com` or your GitHub Enterprise host, followed by a personal access token. Atlas verifies the token before saving it; each repository’s permissions are checked separately. For a fine-grained token, select the correct resource owner and explicitly include the private repositories you want to monitor. Each host has a separate connection. Enterprise uses the standard `/api/v3` endpoint and system certificate trust.

Public repositories can be monitored without a token, subject to GitHub’s anonymous API limits. The startup checklist includes optional token availability checks and host-specific **personal access token settings** links. A stored token does not guarantee repository permission.

For private repositories, grant a fine-grained token access to the relevant repositories and read permissions for contents and pull requests. Organization approval may be required. Classic tokens typically need `repo` access for private repositories. GitHub requires classic tokens for outside collaborators accessing organization repositories, subject to organization policy. Atlas currently stores one token per host; a fine-grained token is limited to one resource owner.

Enable **Uses SAML SSO** only for projects whose organization uses it. GitHub SSO authorization errors also identify this requirement automatically. For SAML organizations, authorize the token through GitHub's **Configure SSO** where applicable. Atlas uses the authorized token independently of your browser session. Token expiry, revocation, and organization policies still apply. See [GitHub authentication](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api) and [SSO token authorization](https://docs.github.com/en/enterprise-cloud@latest/authentication/authenticating-with-single-sign-on/authorizing-a-personal-access-token-for-use-with-single-sign-on).

Credentials are encrypted with Electron safeStorage and stored separately from project data. When access ends, your saved logs, inventories, and PR snapshots remain available as history, while authenticated repository actions are hidden. Website monitoring continues independently.

## Authentication reminders

The project editor provides an expected expiration date, expected reauthentication interval, and hourglass warning period. The default warning period is seven days; fractional days are supported.

Project details show the schedule and countdown. An orange hourglass appears within the warning period. GitHub-reported token expiry is used when provided; manually entered SAML dates are labeled estimates. The earliest known deadline is displayed. Update an estimated deadline after reauthorizing: a successful API check does not renew SAML authorization or move that reminder.

## Local vulnerability watch

Enable security monitoring for a project and add its exact-version dependency inventory. Atlas downloads public GitHub advisories and NVD CVE feeds hourly and matches them locally. Dependency inventories are matched on your device and are never included in advisory requests. If a GitHub.com token is saved, Atlas uses it only for GitHub API requests, including the public advisory feed, to use the authenticated rate limit. It is never sent to NVD or monitored endpoints; Enterprise credentials are used only with their configured Enterprise API. GitHub feed rate limits show a retry time and retain cached results. **Security → Check now** runs the job immediately.

Warnings include advisory links, severity, CVSS scores when available, component versions, patch information, and match confidence. New matches create notifications and timeline entries after the initial baseline. Feed freshness and download errors are visible alongside cached results.

Enter one component per line:

```text
npm | @sanity/client | 8.0.0
nuget | Newtonsoft.Json | 12.0.1
maven | org.apache.logging.log4j:log4j-core | 2.14.1
composer | drupal/core | 10.1.7 | drupal:drupal
cms | WordPress | 6.4.0 | wordpress:wordpress
```

The optional fourth column is an exact NVD CPE `vendor:product` mapping. CMS presets cover WordPress, Shopify, Wix, Squarespace, Joomla, Drupal, and Sanity. Replace `?` with installed versions. Plugins need their own package identity or CPE mapping. Hosted platform presets alone cannot establish version-specific coverage.

Use **Import lockfile / SBOM** for npm lockfiles, NuGet `packages.lock.json`, Composer lockfiles, or SPDX/CycloneDX JSON inventories. Maven/Gradle projects can supply a resolved SBOM from their normal build pipeline. An optional daily GitHub inventory refresh discovers supported lockfiles and SBOMs while access is available. It reads up to 30 files of 10 MB each; incomplete scans retain the last snapshot and show a coverage message.

The matcher handles npm semver and simple stable numeric ranges in other ecosystems. Complex qualifiers, unknown versions, and conditional NVD applicability are marked **Needs review**. Inventory accuracy matters, particularly after repository access ends.

The first sync covers 30 days of GitHub advisory modifications and eight days of NVD modifications. Cached records are retained. Use **Import historical feed** for older NVD 2.0 JSON feeds or GitHub advisory arrays. Check source freshness, coverage dates, inventory completeness, and review flags when assessing a project.

Sources: [GitHub Advisory Database API](https://docs.github.com/en/rest/security-advisories/global-advisories) and [NVD data feeds](https://nvd.nist.gov/vuln/data-feeds). This product uses data from the NVD API but is not endorsed or certified by the NVD.

## Storage and portability

Use **Export workspace** and **Import** in the footer to move projects between devices. Exports include notes, monitoring preferences, inventories, and historical findings. Credentials are excluded. Imports add projects while preserving existing entries, then reset live status and authenticated actions. Reconnect accounts on the receiving device.

Files live in Electron's `userData` directory:

- `projects.json`: projects, notes, preferences, and bounded activity history.
- `credentials.json`: encrypted account credentials.
- `security-cache.json`: downloaded advisory records.

Theme preferences are saved in the application's local browser storage.

## Application updates

Installed Atlas builds check the GitHub `main` release channel at startup and hourly. An available update shows a banner with **Download update**, progress, and **Restart to update**. You control both download and restart. Check manually in **Settings & connections**. The source checkout uses the source files directly.

Windows, macOS, and AppImage use the platform updater. Debian, Fedora, and Arch packages download a verified artifact and request administrator approval through Polkit before the package manager installs it. Cancelling authorization leaves Atlas open with a retryable error. Project data remains in the same user-data directory across source and installed builds.

The update feed uses published GitHub release assets. The repository must expose those assets publicly for the configured unauthenticated client. Application updates use a separate connection from your monitored repository accounts.

## Build installers and update releases

```sh
npm run dist:linux -- --x64
npm run dist:win -- --x64 --arm64
npm run dist:mac -- --universal
```

Build Windows installers on Windows and Mac disk images on macOS. Linux builds need `rpm`, `libarchive-tools`, and `zstd` in addition to the development requirements. Outputs are written to `release/`. Packaging commands build locally with publication disabled.

The **Build installers and main updates** GitHub Actions workflow builds x64/arm64 Linux packages, a combined Windows installer, and a universal Mac package. Manual runs provide downloadable workflow artifacts. Pushes to `main` generate a version such as `0.1.7-main.42` and publish its update release after every platform succeeds and all assets have been uploaded to a draft.

Automatic main publication is enabled when these repository secrets are configured:

- `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`: Windows signing certificate and password.
- `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`: Apple Developer ID certificate and password.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`: Apple notarization credentials.

The workflow uses its GitHub token to upload releases. Without the required signing/notarization setup, main builds remain downloadable review artifacts and do not enter the automatic update feed. Release artifacts include updater metadata and blockmaps. Keep the application identifier and signing identity stable between releases.

## Development

Electron handles persistence, credentials, monitoring, and startup diagnostics in `electron/`. The React/TypeScript interface lives in `src/`. Styling uses custom CSS: shared component rules in `src/styles.css` and theme palettes in `src/themes.css`. The preload bridge exposes named operations with the renderer sandbox enabled.

```sh
npm test
npm run build
npm run preview
npm run test:ui
```

Browser tests use Chrome at `/opt/google/chrome/chrome`; set `ATLAS_CHROMIUM` to your Chromium executable if needed. `npm run verify:feeds` checks public feed connectivity. `npm run format` formats the source and documentation.

Read [AGENTS.md](AGENTS.md) for contributor instructions and [PLAN.md](PLAN.md) for implementation scope.

To publish an unsigned preview from a successful tag build, create a draft prerelease for that tag and run **Publish built preview installers** with the installer workflow run ID and tag. It verifies the build commit, package checksums, and complete platform set before uploading and publishing. This manual preview workflow does not replace the signing requirements for automatic main updates.

Technology badges use locally bundled [Devicon](https://github.com/devicons/devicon) artwork (MIT). Names remain visible beside icons, with colored dots for unrecognized technologies.

## Backend health and monitoring controls

Choose **Backend health endpoint** as the availability monitor and enter the full endpoint URL, such as `https://api.example.com/health` or `https://api.example.com/actuator/health`. Atlas sends a GET every minute while that monitor is enabled. Configure the endpoint in your backend; Atlas does not host it.

A successful response with `Healthy`, `UP`, `OK`, `{"status":"healthy"}`, `{"status":"UP"}`, or `{"healthy":true}` displays **Healthy**. An empty successful response is accepted as an HTTP-only health signal. Explicit unhealthy responses or HTTP 5xx display **Unhealthy**; `Degraded` displays separately. Network/access errors, malformed JSON, and unrecognized responses stay unverified. Responses are limited to 64 KB. Health requests never include GitHub credentials.

The project’s three-dot menu offers **Edit**, **Unwatch / Resume watching**, **Refresh**, and **Delete**. Unwatch pauses all checks and preserves the previous choices and history. Resume restores those choices. Refresh respects the enabled checks; deletion asks for confirmation.

The Security sidebar badge shows critical and high CVE matches for watched projects matching your filters. Activity shows unread events matching the same project filters; opening Activity in the foreground marks that stream as seen. Read markers are saved locally and preserved in import/export. Activity arriving while the window is hidden or a project/settings dialog covers the tab stays unread.

Availability history records the initial verified state and subsequent transitions. Unchanged refreshes update check times and latency without creating more activity. Monitoring errors are recorded once per error period; recovery does not repeat an unchanged verified availability state.
