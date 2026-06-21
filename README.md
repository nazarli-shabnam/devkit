# envkit

Set up your whole local dev environment with one command. Define your dependencies, databases, and services in a single file — then let envkit install everything, spin up Docker, and keep your setup shareable and versioned. Secrets stay in `.env`, never in your config.

> Requires Node.js 16+

## Install

```bash
npm install -g dev-env-kit
```

This gives you the `envkit` command (also available as `dev-env-kit`). If your shell can't find it afterward, run `envkit path-setup` once.

## Quick start

```bash
envkit init      # answer a few questions to create .dev-env.yml
envkit setup     # install dependencies + run migrations/seeds
envkit generate  # create docker-compose.yml from your config
```

That's the whole loop. Run any command from your project root or any subfolder — envkit finds the project automatically.

## Commands

| Command | What it does |
|---------|--------------|
| `envkit init` | Create your `.dev-env.yml` with a short interactive wizard. |
| `envkit setup` | Install dependencies and run database migrations + seeds. Skip parts with `--skip-deps`, `--skip-db`, or preview with `--dry-run`. |
| `envkit validate` | Check your config is valid — great for CI. Use `--strict` to also fail on warnings. |
| `envkit generate` | Build a `docker-compose.yml` from your config. `--dry-run` prints it instead of writing. |
| `envkit snapshot create/list/restore/delete` | Save and switch between config versions. Restoring backs up your current config first. |
| `envkit share export` / `import` | Share your setup with teammates — secrets are swapped for placeholders on export. |

Add `-v` for more detail or `-q` for less. Run `envkit <command> --help` anytime.

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

See [.dev-env.example.yml](./.dev-env.example.yml) for every available option. Don't have a config yet? Just run `envkit init` — or if you run `envkit setup` without one, it'll offer to create it for you.

## Contributing

```bash
npm install
npm test
```

## License

MIT
