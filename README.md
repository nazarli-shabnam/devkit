# devkit

CLI for local development: one-command project setup, environment snapshots, and Docker Compose generation.

**Requires:** Node.js >= 16

## Install

```bash
npm install -g devkit
```

Or run without installing: `npx devkit <command>`

## Usage

Add a `.dev-env.yml` in your project root (see [.dev-env.yml.example](./.dev-env.yml.example)), then:

```bash
devkit setup
```

**Commands:** `setup` | `snapshot create|list|restore` | `generate` | `share export|import`

## Testing

```bash
npm install
npm test
```

Optional: `npm test -- --coverage` for a coverage report.

## License

MIT
