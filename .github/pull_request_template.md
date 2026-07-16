## Summary

Describe the user-visible and operational outcome.

## Verification

- [ ] `pnpm desktop:release-check` and `pnpm test:compatibility`
- [ ] Typecheck, lint, unit tests, and builds
- [ ] Relevant Playwright and/or desktop WDIO coverage
- [ ] Rust format, Clippy, and tests for native changes
- [ ] Archive/import compatibility checked when contracts or persistence changed
- [ ] No production data, credentials, or release state was modified

## Release notes

List migrations, signing/configuration requirements, manual checks, and rollback considerations. Write “None” when not applicable.
