# devkit

A CLI for local development environments: one-command setup, environment snapshots, and Docker Compose generation from a single config file.

**Requires:** Node.js >= 16

## What it does

- **Setup** — Reads your project’s `.dev-env.yml`, installs dependencies, runs database migrations and seed commands.
- **Generate** — Produces `docker-compose.yml` from the same config (databases, services, network).
- **Snapshots** — Save and list copies of your current config under `.devkit/snapshots/<name>/` for later restore.
- **Share** — Export sanitized config (no secrets) or import a shared config file.

Config is one YAML file plus optional `.env` for secrets; you reference variables with `${VAR_NAME}`. The CLI finds the project root from the current directory (looks for `.dev-env.yml` or `package.json`).

## Install

```bash
npm install -g devkit
```

Or run without installing: `npx devkit <command>`

## How to use

### 1. Configure your project

In your project root, add a `.dev-env.yml` that describes your dev environment (dependencies, databases, services). Copy the example file to `.dev-env.yml`, then edit:

```bash
cp .dev-env.example.yml .dev-env.yml
```

See [.dev-env.example.yml](./.dev-env.example.yml) for all options. Put secrets in a `.env` file and reference them in the config with `${VAR_NAME}`.

### 2. Set up the environment

From the project root (or any subdirectory):

```bash
devkit setup
```

This installs dependencies, runs database migrations, and runs seed commands according to your config. Options:

| Option        | Description                          |
|---------------|--------------------------------------|
| `--skip-deps` | Skip installing dependencies         |
| `--skip-db`   | Skip database migrations and seed    |
| `--dry-run`   | Show what would run, without running |

### 3. Generate Docker Compose

To create a `docker-compose.yml` from your `.dev-env.yml` (when `docker.enabled` is true):

```bash
devkit generate
```

Use `-o <file>` to write to a different file, e.g. `devkit generate -o docker-compose.dev.yml`.

### 4. Snapshots

Save the current config and metadata under `.devkit/snapshots/<name>/`:

```bash
devkit snapshot create [name]
```

If you omit `name`, a timestamped name is used. List snapshots:

```bash
devkit snapshot list
```

Restore a snapshot to `.dev-env.yml`: `devkit snapshot restore <name>`.

### 5. Share (export / import)

Export a sanitized copy of your config (passwords and secrets replaced with placeholders like `${DB_PASSWORD}`):

```bash
devkit share export
```

Writes to `dev-env.shared.yml` by default. Use `-o <file>` to choose another path.

Import a shared config file into your project (validates and writes to `.dev-env.yml` by default):

```bash
devkit share import path/to/dev-env.shared.yml
```

Use `-o <file>` to write to a different path.

### 6. Global options

- `-v, --verbose` — more log output  
- `-q, --quiet` — less output  

Example: `devkit -q setup`

### Quick reference

| Command                      | Description                              |
|-----------------------------|------------------------------------------|
| `devkit setup`               | Install deps, run migrations & seed     |
| `devkit generate`            | Generate docker-compose from config     |
| `devkit snapshot create [name]` | Save current config to a snapshot  |
| `devkit snapshot list`       | List snapshots                           |
| `devkit snapshot restore <name>`  | Restore a snapshot to .dev-env.yml |
| `devkit share export`          | Export sanitized config (-o file)  |
| `devkit share import <file>`   | Import shared config (-o file)     |

Use `devkit --help` or `devkit <command> --help` for details.

## Testing

```bash
npm install
npm test
```

Optional: `npm test -- --coverage` for a coverage report.

## License

MIT
