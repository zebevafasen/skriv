# Required `main` protection

Configure a GitHub ruleset for `main` with these ongoing release requirements:

- Require pull requests and disallow direct pushes.
- Require the `quality`, `web-e2e`, and `windows` jobs from Unified CI.
- Require the Vercel preview deployment for hosted changes.
- Dismiss stale approvals after new commits and require repository-owner approval.
- Block force pushes and branch deletion.
- Allow the repository owner to choose squash, rebase, or merge commits according to the change.

Desktop releases are not created by pushes or tags. Dispatch **Desktop Release** from a clean `main` commit whose committed desktop version matches the workflow input. Publish its draft only after completing `docs/desktop-release.md`.
