# Deployment Guide

**Last Updated:** 2026-03-01
**Current Platform:** GitHub Pages
**Domain:** rook.squickr.com
**Status:** 🚧 Pipeline configured — DNS pending

---

## Overview

Squickr Rook uses a **tag-based deployment workflow** with continuous integration.

- **Development:** Work directly on `master` branch
- **CI Validation:** Every push to `master` runs build + tests automatically
- **Production:** Tag releases with `git tag v0.x.0` to deploy
- **Deploy Target:** GitHub Pages at rook.squickr.com

---

## One-Time Setup (Required Before First Deploy)

### Step 1: Create the GitHub Repository

Create the repository at: https://github.com/new

- **Owner:** psychosledge
- **Repository name:** `squickr-rook`
- **Visibility:** Public *(GitHub Pages requires public repo on free tier)*
- Do **not** initialize with README (repo already has content)

Then push the local repo:

```bash
git remote add origin https://github.com/psychosledge/squickr-rook.git
git push -u origin master
```

---

### Step 2: Enable GitHub Pages

1. Go to: https://github.com/psychosledge/squickr-rook/settings/pages
2. Under **Source**, select **GitHub Actions**
3. Leave everything else as default — the workflow handles the rest

---

### Step 3: Configure DNS (Manual — Do This in Your DNS Provider)

Add a **CNAME record** in your DNS provider's control panel:

| Type | Host/Name | Value | TTL |
|------|-----------|-------|-----|
| `CNAME` | `rook` | `psychosledge.github.io` | 3600 (or Auto) |

> **Note:** The `Host` field is just `rook`, not `rook.squickr.com` — your DNS provider automatically appends the root domain.

DNS propagation typically takes 5–30 minutes but can take up to 48 hours.

**Verify DNS is working:**
```bash
dig rook.squickr.com CNAME
# Expected: rook.squickr.com. → psychosledge.github.io.
```

---

### Step 4: Set Custom Domain in GitHub Pages Settings

After DNS propagates:

1. Go to: https://github.com/psychosledge/squickr-rook/settings/pages
2. Under **Custom domain**, enter: `rook.squickr.com`
3. Click **Save**
4. Wait for the DNS check to pass (green checkmark)
5. Check **Enforce HTTPS** once the TLS certificate is issued

---

## Deployment Workflow

### Standard Release

```bash
# 1. Complete your work on master
git add .
git commit -m "feat: add new feature"
git push origin master

# 2. Bump version in package.json files, then:
git add package.json apps/web/package.json packages/engine/package.json
git commit -m "chore: bump version to 0.2.0"
git push origin master

# 3. Create release tag — THIS triggers deployment
git tag -a v0.2.0 -m "v0.2.0 - Feature Name"
git push origin v0.2.0
```

### Hotfix Release

```bash
git add .
git commit -m "fix: resolve critical issue"
git push origin master

git add package.json apps/web/package.json packages/engine/package.json
git commit -m "chore: bump version to 0.1.1"
git push origin master

git tag -a v0.1.1 -m "v0.1.1 - Hotfix: description"
git push origin v0.1.1
```

---

## Branch Structure

| Branch | Purpose | CI Checks | Auto-Deploy |
|--------|---------|-----------|-------------|
| `master` | Main development and production code | ✅ Yes | ❌ No (tags only) |

---

## Deployment Checklist

Before creating a release tag:

- [ ] All tests passing: `pnpm --filter @rook/engine test && pnpm --filter @rook/web test`
- [ ] Build succeeds: `pnpm --filter @rook/engine build && pnpm --filter @rook/web build`
- [ ] CI checks passing on master (green on GitHub)
- [ ] Version bumped in root + workspace `package.json` files
- [ ] CHANGELOG.md updated
- [ ] Commit pushed to master before tagging

---

## Monitoring

```bash
# List recent deploy runs
gh run list --workflow=deploy.yml

# View specific run logs
gh run view <run-id> --log

# Verify DNS
dig rook.squickr.com CNAME

# Verify HTTPS
curl -I https://rook.squickr.com
```

---

## Troubleshooting

### Custom Domain Disappeared After Deploy
The `CNAME` file at `apps/web/public/CNAME` is automatically copied to `dist/` by Vite. If missing from the repo, GitHub Pages loses the custom domain on each deploy.

### HTTPS Certificate Not Issued
1. Confirm CNAME DNS record is correct
2. Confirm custom domain is set in GitHub Pages settings
3. Wait up to 24 hours
4. Check: https://github.com/psychosledge/squickr-rook/settings/pages

### No Environment Secrets Needed
This is a pure static PWA. No Firebase, no Supabase, no `.env` variables required for the build.
