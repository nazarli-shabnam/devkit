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

After installation, use the `envkit` command. To run without installing:

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

### 3. Generate Docker Compose

When `docker.enabled` is set in your config, you can generate a Compose file from it:

```bash
envkit generate
```

Output goes to `docker-compose.yml` by default. Use `-o <file>` to write elsewhere, e.g. `envkit generate -o docker-compose.dev.yml`.

### 4. Snapshots

Save the current config as a named snapshot under `.devkit/snapshots/`:

```bash
envkit snapshot create [name]
```

If you omit the name, a timestamp-based name is used. List existing snapshots:

```bash
envkit snapshot list
```

Restore a snapshot (overwrites `.dev-env.yml`):

```bash
envkit snapshot restore <name>
```

### 5. Share config (export / import)

Export a safe-to-share copy of your config (passwords and secrets become placeholders like `${DB_PASSWORD}`):

```bash
envkit share export
```

By default this writes `dev-env.shared.yml`. Use `-o <file>` to change the path.

Import a shared config file (it is validated and then written to `.dev-env.yml` by default):

```bash
envkit share import path/to/dev-env.shared.yml
```

Use `-o <file>` to write to a different path.

### Global options

- **`-v, --verbose`** — More detailed log output.
- **`-q, --quiet`** — Reduce output.

Example: `envkit -q setup`

---

## Command reference

| Command | Description |
|--------|-------------|
| `envkit init` | Create `.dev-env.yml` interactively (wizard) |
| `envkit setup` | Install deps, run migrations and seed |
| `envkit generate` | Generate docker-compose from config |
| `envkit snapshot create [name]` | Save current config as a snapshot |
| `envkit snapshot list` | List snapshots |
| `envkit snapshot restore <name>` | Restore a snapshot to `.dev-env.yml` |
| `envkit share export` | Export sanitized config (optional `-o` path) |
| `envkit share import <file>` | Import shared config (optional `-o` path) |

For more detail: `envkit --help` or `envkit <command> --help`. A short **“what to run when”** guide is in [DOCUMENTATION.md](./DOCUMENTATION.md).

---

## Development and testing

To work on the source or run tests:

```bash
npm install
npm test
```

Use `npm test -- --coverage` for a coverage report. See [DEVELOPMENT.md](./DEVELOPMENT.md) for the full contributor guide.

---

## License

MIT
