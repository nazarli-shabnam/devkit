# envkit

Set up your whole local dev environment from one file. Define your dependencies, databases, and services once — then let envkit install dependencies, run migrations and seeds, generate a ready-to-use `docker-compose.yml` for your databases and services, and keep your setup shareable and versioned. Secrets stay in `.env`, never in your config.

envkit writes the Compose file but does not start containers for you: you run `docker compose up -d` yourself (see the quick start).

> Requires Node.js 16+

## Install

```bash
npm install -g dev-env-kit
```

This gives you the `envkit` command (also available as `dev-env-kit`). If your shell can't find it afterward, run `envkit path-setup` once.

## Quick start

```bash
envkit init               # answer a few questions to create .dev-env.yml
envkit generate           # create docker-compose.yml from your config
docker compose up -d      # start the databases and services
envkit setup              # install dependencies + run migrations/seeds
```

The order matters: migrations and seeds talk to your databases, so the containers must be running before `envkit setup`. If your databases are not run through Docker (or are already running), you can skip the middle two steps.

Run any command from your project root or any subfolder — envkit finds the project automatically.

## Commands

| Command | What it does |
|---------|--------------|
| `envkit init` | Create your `.dev-env.yml` with a short interactive wizard. |
| `envkit setup` | Install dependencies and run database migrations + seeds. Skip parts with `--skip-deps`, `--skip-db`, or preview with `--dry-run`. |
| `envkit validate` | Check your config is valid — great for CI. Use `--strict` to also fail on warnings. |
| `envkit generate` | Build a `docker-compose.yml` from your config. `-o, --output <file>` writes elsewhere (default `docker-compose.yml`); `--dry-run` prints it instead of writing. |
| `envkit snapshot create/list/restore/delete` | Save and switch between config versions. `create [name] --force` replaces an existing snapshot; `restore <name> -y` skips the confirmation. Restoring backs up your current config first. |
| `envkit share export` / `import` | Share your setup with teammates — secrets are swapped for placeholders on export. Both accept `-o, --output <file>`; `import <file> --validate-only` checks a file without writing anything. |
| `envkit path-setup` | Add envkit to your `PATH` so `envkit` works from any folder (alias `pathsetup`). Run it once if your shell can't find the command after installing. |

Add `-v` for more detail or `-q` to print errors only — data you asked for, such as `snapshot list`, is still shown. Run `envkit <command> --help` anytime.

### Where things are stored

Snapshots live in `.devkit/snapshots/<name>/` inside your project (the config as it was, plus a small metadata file). Add `.devkit/` to your `.gitignore` unless you want to commit them.

## Configuration

Everything lives in one `.dev-env.yml` at your project root. Keep secrets in a `.env` file and reference them with `${VAR_NAME}`:

```yaml
name: my-app

dependencies:
  - type: npm
    command: npm install

databases:
  - type: postgresql
    port: 5432
    user: ${DB_USER}
    password: ${DB_PASSWORD}
    database: myapp

docker:
  enabled: true
```

### Variables

- `${VAR}` is replaced from `.env`, your shell, or the config's own `env:` block (the block wins).
- `${VAR:-fallback}` uses `fallback` when `VAR` is unset or empty.
- `$${VAR}` writes a literal `${VAR}` (for example in a healthcheck `test` that the container's shell should expand).
- Numeric fields such as `port` accept variables too (`port: ${DB_PORT}`).
- Quote versions (`version: "3.10"`): YAML reads an unquoted `3.10` as the number `3.1`.

See [.dev-env.example.yml](./.dev-env.example.yml) for every available option. Don't have a config yet? Just run `envkit init` — or if you run `envkit setup` without one, it'll offer to create it for you.

## Contributing

```bash
npm install
npm test
```

## License

MIT
