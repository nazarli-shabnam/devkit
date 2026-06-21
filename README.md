# envkit

**envkit** is a CLI that manages local development environments from a single config file. Define dependencies, databases, and services in one place; run one command to set up the project, generate Docker Compose, and optionally snapshot or share configs—without committing secrets.

**Requirements:** Node.js >= 16

---

## What it does

- **Setup** — Uses your `.dev-env.yml` to install dependencies and run database migrations and seed commands in one go.
- **Generate** — Builds a `docker-compose.yml` from the same config (databases, services, network).
- **Snapshots** — Saves and restores config versions under `.devkit/snapshots/` so you can switch between setups.
- **Share** — Exports a sanitized config (secrets replaced with placeholders) or imports a shared config file into your project.

Configuration is a single YAML file; secrets live in `.env` and are referenced as `${VAR_NAME}`. The CLI discovers the project root from your current directory (it looks for `.dev-env.yml` or markers like `package.json`).

---

## Install

```bash
npm install -g dev-env-kit
```

After installation you can use either:

- **`envkit <command>`** — short name
- **`dev-env-kit <command>`** — same, using the package name

After install, **path-setup** runs automatically: if you're in an interactive terminal, you may be prompted to add envkit to your PATH so `envkit` works from any folder. You can run it again anytime with `npx dev-env-kit path-setup` or `npx dev-env-kit pathsetup` (no hyphen; use `pathsetup` if your shell doesn't like `path-setup`).

If the command is still not found, use:

```bash
npx dev-env-kit <command>
```

---

## How to use

### 1. Add a config file

You need a `.dev-env.yml` in your project root for **setup**, **generate**, **share export**, and **snapshot create**. If you don’t have one yet:

- **Interactive terminal:** Run `envkit init` to create `.dev-env.yml` via a short wizard. If you run a command that needs config (e.g. `envkit setup`) without a config file, the CLI will ask whether to run `envkit init` now.
- **Non-interactive (CI, scripts):** Create `.dev-env.yml` by hand or run `envkit init` in a terminal first; otherwise those commands exit with a message to create a config or run `envkit init`.

**If you already have an example file**, the fastest way to start is to copy it and edit it:

```bash
cp .dev-env.example.yml .dev-env.yml
```

The example file documents all options (dependencies, databases, services, env vars, Docker settings). Keep sensitive values in a `.env` file and reference them in the config with `${VAR_NAME}` so they never end up in version control.

See [.dev-env.example.yml](./.dev-env.example.yml) for the full reference.

### 2. Set up the environment

From the project root (or any subdirectory):

```bash
envkit setup
```

This installs dependencies, runs database migrations, and runs seed commands according to your config. You can narrow what runs:

| Option        | Description                          |
|---------------|--------------------------------------|
| `--skip-deps` | Skip dependency installation         |
| `--skip-db`   | Skip database migrations and seed    |
| `--dry-run`   | Show what would run, without running |

### 3. Validate your config

Check that `.dev-env.yml` (and any `.env`) is well-formed without running setup or generate — handy for CI and pre-commit hooks:

```bash
envkit validate
```

It exits non-zero on a missing or invalid config. Add `--strict` to also fail on warnings (e.g. hardcoded passwords, port conflicts) and unresolved `${VAR}` references:

```bash
envkit validate --strict
```

### 4. Generate Docker Compose

When `docker.enabled` is set in your config, you can generate a Compose file from it:

```bash
envkit generate
```

Output goes to `docker-compose.yml` by default. Use `-o <file>` to write elsewhere, e.g. `envkit generate -o docker-compose.dev.yml`. To preview the generated Compose without writing a file (e.g. to pipe or inspect it), use `--dry-run`:

```bash
envkit generate --dry-run
```

### 5. Snapshots

Save the current config as a named snapshot under `.devkit/snapshots/`:

```bash
envkit snapshot create [name]
```

If you omit the name, a timestamp-based name is used. List existing snapshots:

```bash
envkit snapshot list
```

Restore a snapshot. This overwrites `.dev-env.yml`, but your current config is automatically backed up to a `pre-restore-<timestamp>` snapshot first, and you'll be asked to confirm in an interactive terminal (use `--yes` to skip the prompt in scripts):

```bash
envkit snapshot restore <name>
```

Delete a snapshot you no longer need:

```bash
envkit snapshot delete <name>
```

### 6. Share config (export / import)

Export a safe-to-share copy of your config (passwords and secrets become placeholders like `${DB_PASSWORD}`):

```bash
envkit share export
```

By default this writes `dev-env.shared.yml`. Use `-o <file>` to change the path.

Import a shared config file (it is validated and then written to `.dev-env.yml` by default). The `<file>` path is resolved relative to your **current working directory**:

```bash
envkit share import path/to/dev-env.shared.yml
```

Use `-o <file>` to write to a different path (also relative to the current directory unless you pass an absolute path). To check a shared file is valid without writing anything (useful in CI), pass `--validate-only`:

```bash
envkit share import path/to/dev-env.shared.yml --validate-only
```

### Global options

- **`-v, --verbose`** — More detailed log output.
- **`-q, --quiet`** — Reduce output.

Example: `envkit -q setup`

---

## Command reference

| Command | Description |
|--------|-------------|
| `envkit init` | Create `.dev-env.yml` interactively (wizard). Run from a project folder when you don’t have a config yet. |
| `envkit setup` | Install dependencies, run database migrations, and run seed commands from your config. Use `--skip-deps`, `--skip-db`, or `--dry-run` to limit what runs. |
| `envkit validate` | Validate `.dev-env.yml` (and `.env`) without running setup or generate. Add `--strict` to fail on warnings and unresolved `${VAR}` references. CI/pre-commit friendly. |
| `envkit generate` | Generate `docker-compose.yml` from your config (requires `docker.enabled` in config). Use `-o <file>` to set the output path, or `--dry-run` to print without writing. |
| `envkit snapshot create [name]` | Save the current `.dev-env.yml` as a snapshot under `.devkit/snapshots/`. Omit `name` to use a timestamp. |
| `envkit snapshot list` | List all saved snapshots. |
| `envkit snapshot restore <name>` | Restore a snapshot; overwrites `.dev-env.yml` (current config is backed up first). Use `--yes` to skip the confirmation prompt. |
| `envkit snapshot delete <name>` | Delete a saved snapshot. |
| `envkit share export` | Export a sanitized config (secrets → placeholders) to share safely. Default output: `dev-env.shared.yml`; use `-o <file>` to override. |
| `envkit share import <file>` | Import a shared config file; writes to `.dev-env.yml` by default. Use `-o <file>` to write elsewhere, or `--validate-only` to validate without writing. |
| `envkit path-setup` or `envkit pathsetup` | Add the npm global bin folder to your PATH so `envkit` works from any directory. Use if the shell says “envkit” is not recognized after a global install. |

For more detail: `envkit --help` or `envkit <command> --help`.
---

## Development and testing

To work on the source or run tests:

```bash
npm install
npm test
```

Use `npm test -- --coverage` for a coverage report.

---

## License

MIT
