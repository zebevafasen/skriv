# Required `main` protection

Configure this ruleset in GitHub before opening the unification pull request:

- Require a pull request and disallow direct pushes.
- Require the `quality`, `web-e2e`, and `windows` checks from `Unified CI`.
- Require the Vercel preview deployment check.
- Require the repository owner approval; dismiss stale approvals after new commits.
- Disable auto-merge for the repository during the unification review.
- Allow merge commits and use one for the final integration so the cutover is reversible as a unit.

Do not change the production branch or deploy the integration branch as production before the manual checklist is complete.
