# envkit — Command reference

**Package:** `dev-env-kit` · **CLI:** `envkit` · **Config:** `.dev-env.yml` · **Snapshots:** `.devkit/snapshots/`

This document lists every command and **when to run it**. For install and setup, see [README.md](./README.md).

---

## Quick reference: what to run when

| Situation | Command |
|-----------|---------|
| Project has no `.dev-env.yml` and you want to create one | `envkit init` |
| You want to install deps, run migrations, and seed (first time or after config change) | `envkit setup` |
| You want to preview setup without running it | `envkit setup --dry-run` |
| You want to install deps but skip DB migrations/seed | `envkit setup --skip-db` |
| You want to run DB migrations/seed but skip dependency install | `envkit setup --skip-deps` |
| You want a `docker-compose.yml` from your config | `envkit generate` |
| You want the Compose file under a different path | `envkit generate -o docker-compose.dev.yml` |
| You want to save the current config as a named backup | `envkit snapshot create [name]` |
| You want to see existing snapshot names | `envkit snapshot list` |
| You want to restore a snapshot (overwrites `.dev-env.yml`) | `envkit snapshot restore <name>` |
| You want to share config with someone without secrets | `envkit share export` |
| You want to write the export to a specific file | `envkit share export -o my-shared.yml` |
| You received a shared config file and want to use it | `envkit share import <file>` |
| You want to import to a path other than `.dev-env.yml` | `envkit share import <file> -o .dev-env.yml` |

---

## Commands in detail

### `envkit init`

**When:** You are in a project that does not yet have `.dev-env.yml` and you want to create one via a wizard.

**What it does:** Asks questions (project name, dependencies, databases, services, env, Docker, etc.) and writes a valid `.dev-env.yml`. If the file already exists, it asks whether to overwrite.

**Requires:** Interactive terminal (TTY). In CI or non-interactive use it exits with a message to run `envkit init` in a terminal.

**Options:** None.

---

### `envkit setup`

**When:** You want to bring the dev environment in line with `.dev-env.yml` (install dependencies, run DB migrations, run seed).

**What it does:** Reads `.dev-env.yml`, then runs dependency install commands and database migrations/seed in order. If there is no config, in a TTY it can prompt to run `envkit init` first.

| Option | When to use |
|--------|--------------|
| `--skip-deps` | Skip dependency installation; only run DB steps. |
| `--skip-db` | Skip migrations and seed; only install deps. |
| `--dry-run` | Log what would run, without executing. |

---

### `envkit generate`

**When:** You want a Docker Compose file generated from your config (databases, services, network).

**What it does:** Reads `.dev-env.yml` and writes a Compose file. Only writes if `docker.enabled` is not false in config. If there is no config, in a TTY it can prompt to run `envkit init` first.

| Option | Default | When to use |
|--------|---------|--------------|
| `-o, --output <file>` | `docker-compose.yml` | Use when you want a different path or filename. |

---

### `envkit snapshot create [name]`

**When:** You want to save the current `.dev-env.yml` (and metadata) as a snapshot so you can restore it later.

**What it does:** Saves the current config under `.devkit/snapshots/<name>/`. If you omit `name`, a timestamp-based name is used. If there is no config, in a TTY it can prompt to run `envkit init` first.

**Options:** Optional positional argument: snapshot name.

---

### `envkit snapshot list`

**When:** You want to see which snapshots exist.

**What it does:** Lists snapshot names and creation times from `.devkit/snapshots/`. Does not require `.dev-env.yml` to exist.

**Options:** None.

---

### `envkit snapshot restore <name>`

**When:** You want to replace the current `.dev-env.yml` with the contents of a snapshot.

**What it does:** Reads the snapshot and writes its config to `.dev-env.yml` (overwrites). Does not require `.dev-env.yml` to exist beforehand.

**Options:** Required positional argument: snapshot name (use `envkit snapshot list` to see names).

---

### `envkit share export`

**When:** You want to give someone else your config without exposing secrets (passwords, env values).

**What it does:** Reads `.dev-env.yml`, replaces secrets with placeholders (e.g. `${DB_PASSWORD}`), and writes the result to a file. If there is no config, in a TTY it can prompt to run `envkit init` first.

| Option | Default | When to use |
|--------|---------|--------------|
| `-o, --output <file>` | `dev-env.shared.yml` | Use when you want a different path or filename. |

---

### `envkit share import <file>`

**When:** You received a shared config file (e.g. `dev-env.shared.yml`) and want to use it as your project config.

**What it does:** Validates the file and writes it to `.dev-env.yml` by default. The `<file>` path is resolved relative to your **current working directory**, not the project root. Does not require an existing `.dev-env.yml`.

| Option | Default | When to use |
|--------|---------|--------------|
| `-o, --output <file>` | `.dev-env.yml` | Use when you want to write to a different path. |

---

## Global options

Use these with any command:

| Option | Effect |
|--------|--------|
| `-v, --verbose` | More detailed logs. |
| `-q, --quiet` | Less output. |

Examples: `envkit -v setup`, `envkit -q generate`.

---

## No config file?

- **`envkit setup`**, **`envkit generate`**, **`envkit share export`**, and **`envkit snapshot create`** need a valid `.dev-env.yml`. If it is missing:
  - In an **interactive terminal**: the CLI can prompt “No config. Run `envkit init`?” and, if you say yes, run the init wizard and then continue.
  - In **non-interactive** use (CI, scripts): the command exits with an error telling you to create `.dev-env.yml` or run `envkit init` in a terminal.

- **`envkit init`** creates the config (no existing file needed).

- **`envkit snapshot list`**, **`envkit snapshot restore`**, and **`envkit share import`** do not require `.dev-env.yml` to exist (they use the snapshot dir or the import file path).

---

## Project root

Commands that use `.dev-env.yml` or `.devkit/` look for the **project root** from your current directory: the folder that contains `.dev-env.yml`, or (if not found) the folder that contains `package.json`, or else the current directory. You can run commands from a subdirectory; the CLI will search upward.
