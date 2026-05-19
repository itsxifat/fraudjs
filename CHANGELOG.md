# Changelog

## [1.0.2] - 2026-05-19
### Fixed
- Replaced example phone number in README and tests with a generic placeholder

## [1.0.1] - 2026-05-19
### Fixed
- Updated all import examples in README from `'fraudjs'` to `'steadfast-fraud'`
- Fixed `npm install` command in README to use the correct package name
- Corrected repository URL in `package.json`

## [1.0.0] - 2026-05-19
### Released
- Initial release
- `checkPhone(phone)` — look up delivery/fraud history by customer phone number
- Multi-credential support with automatic failover
- AES-256-GCM encrypted credential storage in OS config directory
- 24-hour session auto-refresh with transparent re-login
- CLI: `fraudjs check`, `add-credential`, `list-credentials`, `remove-credential`, `refresh`
- Built-in test suite using `node:test` — no extra test dependencies
