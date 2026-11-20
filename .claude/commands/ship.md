Ship a new release: run all tests, bump versions, update the changelog, build, tag, and push.

## Step 1: Run all tests

```bash
pnpm -r test
```

If any tests fail, **stop immediately** and report the failures. Do not proceed.

## Step 2: Determine bump type

Read the current version from the root `package.json`.

If the user specified a bump type (patch / minor / major) in $ARGUMENTS, use that.
Otherwise, ask: "Current version is X.Y.Z. Bump patch, minor, or major?"

Wait for the answer before continuing.

## Step 3: Commit any pending code changes

Run `git status`. If tracked files other than the ones this command edits are modified, commit them first with a conventional-commits message (feat, fix, refactor, chore) describing the code changes. Skip if there are none.

## Step 4: Update versions and changelog

Use Read and Edit, not shell commands. Set `"version"` to the new version in:
- `package.json` (root, checked by the deploy workflow)
- `apps/web/package.json`
- `packages/engine/package.json`

`packages/server/package.json` versions independently; leave it unless the server changed (Step 7).

Add a `## [vX.Y.Z] — YYYY-MM-DD` entry at the top of `CHANGELOG.md`, written for players, grouped under `### New Features`, `### Improvements`, and `### Bug Fixes` as applicable. Draft it from `git log v<PREVIOUS_VERSION>..HEAD` and show it to the user before continuing.

## Step 5: Build

```bash
pnpm build
```

Must succeed before tagging. On failure, stop and report.

## Step 6: Commit, tag, and push

```bash
git add package.json apps/web/package.json packages/engine/package.json CHANGELOG.md
git commit -m "chore: bump version to v<NEW_VERSION>"
git tag v<NEW_VERSION>
git push origin master --tags
```

The tag must point at this commit and match the root `package.json` version; the deploy workflow fails otherwise. If any commit lands after the bump, re-tag at HEAD before pushing.

## Step 7: Deploy the server (if changed)

```bash
git diff v<PREVIOUS_VERSION> v<NEW_VERSION> --name-only -- packages/server/ packages/engine/src/
```

If anything is listed, ask whether to deploy the PartyKit server. On a yes, bump `packages/server/package.json` (patch unless told otherwise), commit it as `chore(server): bump version to <SERVER_VERSION>`, push, and run:

```bash
pnpm server:ship
```

Otherwise skip and note that the server was not redeployed.

Report the tag, version, and whether the server was deployed.
