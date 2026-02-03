# devkit

CLI for local development: one-command project setup, environment snapshots, and Docker Compose generation.

**Requires:** Node.js >= 16

## Install

```bash
npm install -g devkit
```

Or run without installing: `npx devkit <command>`

## How to use

### 1. Configure your project

In your project root, add a `.dev-env.yml` that describes your dev environment (dependencies, databases, services, env vars). Copy and edit the example:

```bash
cp .dev-env.yml.example .dev-env.yml
```

See [.dev-env.yml.example](./.dev-env.yml.example) for all options. Use a `.env` file for secrets and reference them in the config with `${VAR_NAME}`.

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

### 4. Snapshots (list only for now)

List saved environment snapshots:

```bash
devkit snapshot list
```

`snapshot create` and `snapshot restore` are planned; they will save and restore your dev environment state.

### 5. Global options

- `-v, --verbose` — more log output  
- `-q, --quiet` — less output  

Example: `devkit -q setup`

### Quick reference

| Command                    | Description                              |
|----------------------------|------------------------------------------|
| `devkit setup`             | Install deps, run migrations & seed     |
| `devkit generate`         | Generate docker-compose from config     |
| `devkit snapshot list`    | List snapshots                           |
| `devkit snapshot create [name]`  | *(coming soon)* Save current state  |
| `devkit snapshot restore [name]` | *(coming soon)* Restore a snapshot  |
| `devkit share export`     | *(coming soon)* Export config for sharing |
| `devkit share import <file>` | *(coming soon)* Import shared config   |

Use `devkit --help` or `devkit <command> --help` for details.

## Testing

```bash
npm install
npm test
```

Optional: `npm test -- --coverage` for a coverage report.

## License

MIT
