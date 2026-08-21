# Contributing

Thanks for helping improve Sod. This document describes how we branch, merge,
and cut releases.

## Branches

| Branch                 | Purpose                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `main`                 | Always reflects the latest **released** (or release-ready) state. Tagged for SPM consumers. |
| `release/X.Y.Z`        | Integration branch for an upcoming version. Feature work targets here first.                |
| `<type>/<description>` | Short-lived branches for individual changes — see [Branch names](#branch-names).            |

Nothing lands on `main` directly. Open a pull request instead.

### Branch names

Branch names follow [Conventional Branch](https://conventionalbranch.org/):

```text
<type>/<description>
```

Use lowercase letters, numbers, and hyphens in the description. No underscores or
spaces. Release branches may use dots in the version (e.g. `release/0.2.0`).

| Prefix                  | Use for                                                    |
| ----------------------- | ---------------------------------------------------------- |
| `feature/` (or `feat/`) | New functionality                                          |
| `fix/` (or `bugfix/`)   | Bug fixes                                                  |
| `hotfix/`               | Urgent fixes against a released version                    |
| `release/`              | Release integration branches (e.g. `release/0.2.0`)        |
| `chore/`                | Everything else — CI, docs, dependencies, refactors, tests |

Stick to these prefixes. Commit messages have a wider vocabulary (`ci:`,
`test:`, `docs:`, etc. under [Conventional Commits](#commit-messages)); branch
names do not invent new types from commit scopes.

Examples:

```text
feature/consumer-supplied-zod
chore/github-actions
fix/schema-registry-empty-bundle
release/0.2.0
```

### Example flow for 0.2.0

```text
feature/consumer-supplied-zod ──squash──► release/0.2.0 ──merge──► main
chore/github-actions           ──squash──► release/0.2.0              │
chore/expand-test-coverage     ──squash──► release/0.2.0              └── tag 0.2.0
```

1. Create `release/0.2.0` from `main` when starting work on that version.
2. Merge feature PRs into `release/0.2.0` (squash — see below).
3. When the release is ready, open a PR from `release/0.2.0` → `main` (merge
   commit).
4. On `main`, finalize the changelog, commit `chore(release): X.Y.Z`, and tag.

## Merge strategy

We use different merge strategies depending on the target branch.

### Into `release/X.Y.Z` — squash merge

Squash each PR into a single commit on the release branch. This keeps the
release branch readable: one commit per logical change, without losing the full
discussion and review history in the PR itself.

Write a good squash commit message — it becomes the permanent record on the
release branch. The PR title and description are a fine starting point.

### Into `main` — merge commit

Merge the release branch with a **merge commit**, not a squash or rebase. This
preserves the release as a identifiable unit in history and avoids rewriting
commits that may already be signed.

Linear history is not a goal. `git log --first-parent main` gives a clean view of
releases if you need one.

### Do not rebase merge on GitHub

**Rebase and merge is disabled** (or should be). Rebasing rewrites commits, which
**breaks GPG commit verification** — the signatures on the original commits no
longer apply to the rebased SHAs.

Squash and merge commits produce new commits that GitHub can sign on your behalf
if commit signing is enabled in your account settings.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/). Commit
types can be more specific than branch prefixes — a `chore/github-actions`
branch might squash to a `ci:` commit, for example:

```text
feat: add activeZodVersion
fix: reject empty schema bundles
ci: run swift test on pull requests
chore(release): 0.2.0
```

Breaking changes use `!` or a `BREAKING CHANGE:` footer:

```text
feat!: require consumer-supplied Zod via @sod/build
```

## Changelog

[CHANGELOG.md](CHANGELOG.md) follows [Keep a Changelog](https://keepachangelog.com/).

- Work in progress accumulates under `[Unreleased]` on the release branch.
- When shipping, rename `[Unreleased]` to `[X.Y.Z] — YYYY-MM-DD` in the release
  commit on `main`.

## Releases

Cutting a release:

1. Confirm `release/X.Y.Z` is green (CI passing, tests reviewed).
2. Merge `release/X.Y.Z` → `main` with a merge commit.
3. On `main`:
   - Finalize the `[X.Y.Z]` entry in `CHANGELOG.md` (date, any last edits)
   - Confirm `npm/package.json` version matches `X.Y.Z`
   - Commit: `chore(release): X.Y.Z`
4. When CI is green: `git tag X.Y.Z && git push origin X.Y.Z`
5. Create a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) from the tag. Paste the matching `CHANGELOG.md` section as the release notes.
6. Run the [Release](.github/workflows/release.yml) workflow from the Actions tab on the release tag to publish `@sod/build` to npm. Configure the `release` environment with an `NPM_TOKEN` secret (npm automation token).

### First `@sod/build` publish (npm)

Trusted publishing is not available until the package exists on npm. Publish the first version locally:

```bash
npm install
npm run build --workspace @sod/build
cd npm
npm pack --dry-run    # confirm tarball: dist/, README.md, LICENSE, package.json
npm login             # or: export NPM_TOKEN=npm_...
npm publish --access public
```

After the package exists, enable [trusted publishing](https://docs.npmjs.com/trusted-publishers) on npm (GitHub Actions, workflow `release.yml`, environment `release`) if you want provenance on later CI publishes. Until then, the Release workflow uses `NPM_TOKEN`.

SPM consumers pin git tags (e.g. `from: "0.2.0"`). The `@sod/build` npm package
is published separately — run the Release workflow after the GitHub Release is cut.

## Development

```bash
swift test          # no Node toolchain required
swift package plugin --allow-writing-to-package-directory swiftlint -- lint --strict
npm install         # only for @sod/build
npm run lint        # oxlint
npm run fmt:check   # oxfmt
npm run build       # regenerates Tests/SodTests/Fixtures/
```

### Pre-commit hooks

[pre-commit](https://pre-commit.com/) runs the same linters as CI before each
commit. Linter versions come from `Package.swift` (SwiftLint) and
`package.json` (oxlint, oxfmt) — not separate pins in `.pre-commit-config.yaml`.

One-time setup:

```bash
brew bundle            # installs pre-commit from Brewfile
npm install            # required for oxlint / oxfmt hooks
pre-commit install
```

Run all hooks manually (optional):

```bash
pre-commit run --all-files
```

See [README.md](README.md) for install and consumer build instructions.

## Branch protection (recommended)

On `main` and active `release/*` branches:

- Require pull request before merging
- Require status checks to pass (once CI exists)
- Allow **Squash merge** and **Merge commit**
- Disallow **Rebase and merge**
