# Development

For people who work on the **dev-env-kit** source. Covers: repo vs package, local workflow, and publishing.

---

## Repo vs published package

| In the repo | In the npm package (`npm install dev-env-kit`) |
|-------------|-------------------------------------------------|
| `src/`, `tests/`, tooling, DEVELOPMENT.md, STATUS.md | Only `dist/`, `templates/`, `README.md`, `.dev-env.example.yml` (see `package.json` → `"files"`) |

Tests and source are **not** in the package. They run when you or CI runs `npm test`.

---

## Local development workflow

```bash
npm install
npm test          # Jest; use --watch or --coverage as needed
npm run build     # TypeScript → dist/
npm run lint
```

**Run the CLI:** `node dist/cli/index.js --help` or `npm run dev -- <args>` (ts-node, no build).  
**Test install locally:** `npm run build && npm link`, then in another dir run `envkit --help`; unlink with `npm unlink -g dev-env-kit`.

---

## Testing notes

- Tests import from `src/`, not `dist/`. Exec is mocked; integration tests run the built CLI.
- CI (`.github/workflows/ci.yml`): lint, build, test on push/PR. Node 18 and 20.

See **STATUS.md** for implementation status.

---

## Publishing

### Update npm after pushing to GitHub

To publish your latest changes to npm:

1. **Bump version and create a tag**
   ```bash
   npm version patch   # 0.1.3 → 0.1.4 (use minor/major if needed)
   ```
   Use patch for bugfixes (0.1.3 → 0.1.4), minor for new features (0.1.3 → 0.2.0), or major for breaking changes (0.1.3 → 1.0.0). This updates package.json and creates a git tag (e.g. v0.1.4).

2. **Push the commit and tag**
   ```bash
   git push --follow-tags
   ```
   Or push the tag explicitly: `git push origin v0.1.4` (use the tag `npm version` printed).

3. **Let CI publish** — The **Publish to npm** workflow runs when a `v*` tag is pushed. If the repo has the `NPM_TOKEN` secret set (see below), the workflow runs lint, build, test, then `npm publish`. Check **Actions** for the run; when it’s green, the new version is on npm.

**Verify:** `npm view dev-env-kit versions` or https://www.npmjs.com/package/dev-env-kit

---

### Concepts (build, pack, publish, tags)

| Thing | What it does |
|-------|----------------|
| `npm run build` | Compiles `src/` → `dist/`. Local only. |
| `npm pack --dry-run` | Lists what would go in the package (no upload). |
| `npm publish` | Builds (via `prepublishOnly`), packs, uploads to npm. Requires `npm login` (or in CI, `NPM_TOKEN`). |
| Git tag (e.g. `v0.1.4`) | Marks a release; **pushing** it triggers the Publish to npm workflow. |
| GitHub Release | Release notes for a tag; creating one can also trigger the workflow. |

---

### Prerequisites for publishing

- **npm:** Account at [npmjs.com](https://www.npmjs.com/); run `npm login` for manual publish.
- **CI:** In the repo, **Settings → Secrets and variables → Actions** → add secret **`NPM_TOKEN`** with an npm token (Account → Access Tokens; use “Automation” or “Publish packages”). The name must be exactly `NPM_TOKEN`.

---

### Publishing manually (without CI)

```bash
npm version patch
npm publish
git push --follow-tags
```

Optional before publish: `npm run build && npm pack --dry-run` to confirm package contents.

---

### Troubleshooting (Publish to npm workflow)

- **0 runs / doesn’t run** — It runs on: (1) push of a tag `v*`, (2) creation of a GitHub Release, (3) **Actions → Publish to npm → Run workflow**. Push a tag or run it manually.
- **403 Forbidden** — Use an **npm** token (not GitHub), with publish permission. Package name must be `dev-env-kit` (e.g. `envkit` is blocked on npm).

---

## About the package

**dev-env-kit** (CLI: `envkit`) is a local dev environment manager: one `.dev-env.yml` for dependencies, databases, services, env; one command (`envkit setup`) to install and run migrations/seed; optional Docker Compose generation, snapshots (`.devkit/snapshots/`), and share export/import. The CLI finds the project root from the current directory (`.dev-env.yml` or `package.json`).

**User-facing commands:** See [DOCUMENTATION.md](./DOCUMENTATION.md) or `envkit --help`. Config schema: `.dev-env.example.yml`.

**Repo structure:**

| Path | Purpose |
|------|--------|
| `src/cli/index.ts` | CLI entry; commands call into `src/commands/`. |
| `src/commands/` | setup, generate, snapshot, share, init. |
| `src/core/config/` | loader, validator. |
| `src/core/docker/` | compose generator (templates in `templates/`). |
| `src/core/snapshot/` | snapshot storage. |
| `src/types/config.ts` | Zod schema for `.dev-env.yml`. |
| `src/utils/` | logger, file ops, platform, exec. |

Tests in `tests/` mirror `src/`; they import from `src/`, not `dist/`.
