# Publishing fraudjs to npm

Step-by-step guide to publish this package to the public npm registry.

---

## 1. Pre-flight checklist

Before publishing, verify everything is in order:

```bash
# All tests pass
npm test

# Inspect exactly what will be published (dry run — nothing is uploaded)
npm pack --dry-run
```

`npm pack --dry-run` lists every file that would be included. It should show only:
```
bin/fraudjs.js
src/auth.js
src/client.js
src/credentials.js
src/errors.js
src/index.js
src/session.js
README.md
.env.example
package.json
```

The `files` field in `package.json` controls this. `test/`, `node_modules/`, and dotfiles are excluded automatically.

---

## 2. Check if the package name is available

```bash
npm view fraudjs
```

- If you get `404` → the name is free, proceed.
- If you get package info → the name is taken. Either:
  - Use a scoped package name: `@your-npm-username/fraudjs`
  - Pick a different name: e.g. `steadfast-fraud-check`

**To use a scoped name**, update `package.json`:

```json
{
  "name": "@your-username/fraudjs"
}
```

And update `bin/fraudjs.js` import if needed. Scoped packages default to private — add this to `package.json` to make it public:

```json
{
  "publishConfig": {
    "access": "public"
  }
}
```

---

## 3. Create an npm account (if you don't have one)

Go to [npmjs.com](https://www.npmjs.com/signup) and create an account.

Then log in from the terminal:

```bash
npm login
```

You'll be prompted for username, password, and email. If you have 2FA enabled, you'll also need your OTP.

Verify you're logged in:

```bash
npm whoami
# your-username
```

---

## 4. Set up package metadata

Make sure `package.json` has the correct author and repository fields (already pre-filled — update with your real info):

```json
{
  "author": {
    "name": "Your Name",
    "email": "you@example.com"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/fraudjs.git"
  },
  "homepage": "https://github.com/your-username/fraudjs#readme",
  "bugs": {
    "url": "https://github.com/your-username/fraudjs/issues"
  }
}
```

---

## 5. Publish

```bash
npm publish
```

The `prepublishOnly` script in `package.json` runs `npm test` automatically before uploading. If tests fail, the publish is aborted.

For a **scoped public package**:

```bash
npm publish --access public
```

---

## 6. Verify it published

```bash
npm view fraudjs
# or
npm view @your-username/fraudjs
```

Then test the published package from scratch:

```bash
cd /tmp
mkdir test-fraudjs && cd test-fraudjs
npm init -y
npm install fraudjs   # or @your-username/fraudjs
node -e "import('fraudjs').then(m => console.log(Object.keys(m)))"
```

---

## Updating the package (future versions)

Bump the version in `package.json` before publishing. Follow [semver](https://semver.org):

| Change | Version bump | Command |
|---|---|---|
| Bug fix, no API change | patch (1.0.0 → 1.0.1) | `npm version patch` |
| New feature, backwards-compatible | minor (1.0.0 → 1.1.0) | `npm version minor` |
| Breaking API change | major (1.0.0 → 2.0.0) | `npm version major` |

`npm version` updates `package.json` and creates a git tag automatically.

Then publish:

```bash
npm publish
```

---

## Setting up a GitHub repository (recommended)

Having a public GitHub repo lets users report issues and see the source.

```bash
cd /home/sifat-hosen/projects/fraudjs

git init
git add .
git commit -m "Initial release v1.0.0"

# Create repo on GitHub (via gh CLI or the website), then:
git remote add origin https://github.com/your-username/fraudjs.git
git push -u origin main
```

Create a `.gitignore` first:

```
node_modules/
.env
*.key
```

---

## Optional: GitHub Actions for automated testing

Create `.github/workflows/ci.yml` to run tests on every push:

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
```

---

## Adding an npm badge to README

After publishing, add a version badge to `README.md`:

```markdown
[![npm version](https://badge.fury.io/js/fraudjs.svg)](https://www.npmjs.com/package/fraudjs)
[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
```
