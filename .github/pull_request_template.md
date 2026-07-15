## Verification

- [ ] Shared typecheck, lint, unit tests, web build, API build, and Vercel build pass.
- [ ] PostgreSQL integration and web Playwright checks pass.
- [ ] Rust format, clippy, tests, Tauri build, and Windows desktop E2E pass.
- [ ] A Vercel preview uses staging PostgreSQL and a staging private Blob store.
- [ ] The CI-produced desktop beta was installed and manually tested on Windows.
- [ ] Mobile browser parity and v5 archive transfer in both directions were manually verified.
- [ ] Production data, credentials, and deployment were untouched during verification.
- [ ] A production PostgreSQL backup exists and the additive migration set was rehearsed on staging.
- [ ] The owner has given explicit written approval to merge.

`main` must use a merge commit. Auto-merge is not permitted for this unification pull request.
