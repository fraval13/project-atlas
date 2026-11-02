# Project Atlas contributor instructions

Build a local-first Electron application for consultants to remember and monitor their projects.

- Read PLAN.md before changing scope. Keep GitHub.com and GitHub Enterprise working.
- Keep Node access in the main process, context isolation and sandbox enabled, and expose a narrow preload API.
- Store credentials only with Electron safeStorage; never export tokens or send them to monitored URLs.
- SAML authentication belongs to the organization's identity provider. Surface GitHub SSO authorization requirements; never collect identity provider passwords.
- Persist projects, work notes, watch preferences, and activity locally. Import/export uses a validated, versioned format without credentials.
- Monitoring continues in the system tray. Respect project watch preferences and avoid overlapping polls.
- Clearly distinguish sample data, unknown status, monitoring errors, and verified downtime.
- Keep every supported theme accessible, responsive, and keyboard operable.
- Run npm run build and npm test for changes affecting behavior. Document meaningful limitations.
- Peer-to-peer sync is future work. Do not introduce a hosted backend.
- Keep README focused on a newcomer: explain the name, current behavior, requirements, setup, and relevant operational limits. Update it to match implemented changes; omit change history, abandoned approaches, obsolete behavior, and unimplemented features.
- Use custom CSS with descriptive class names. Keep the same UX across Atlas, Hacker, Elegant, and Retro; Elegant defaults on Mac and Atlas elsewhere unless the user saved a choice.
- Keep installers and updates sandboxed. Preserve the user-data directory across source and installed builds. Publish main update manifests only with a complete platform artifact set; downloads and restart/install require explicit user actions.
