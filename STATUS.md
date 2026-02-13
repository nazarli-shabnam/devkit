# Status

**Package:** `dev-env-kit` (npm) · **CLI:** `envkit` · **Config file:** `.dev-env.yml` · **Snapshot dir:** `.devkit/snapshots/`

This doc tracks what’s done and the step-by-step plan for the init wizard and “no config” flow.

---

## Done (foundation)

- **Config:** Zod schemas in `src/types/config.ts` for `.dev-env.yml`; loader in `src/core/config/loader.ts` (YAML, `.env`, `${VAR}` resolution); validator + warnings in `src/core/config/validator.ts`.
- **Utils:** `src/utils/` — platform, file-ops, exec, logger.
- **CLI:** Commander in `src/cli/index.ts`; `--version` / `--help`; global `-v` / `-q`; all commands except `init` implemented.
- **Tests:** 157 tests (Jest), all passing; coverage for config, utils, docker generator, snapshot storage, commands, CLI integration, dependencies (prompts).

---

## Commands (current)

| Command | Status | Options / defaults |
|--------|--------|--------------------|
| `envkit setup` | Done | `--skip-deps`, `--skip-db`, `--dry-run` |
| `envkit generate` | Done | `-o <file>` default `docker-compose.yml` |
| `envkit snapshot create [name]` | Done | Saves to `.devkit/snapshots/<name>/` (timestamp name if omitted) |
| `envkit snapshot list` | Done | Lists `.devkit/snapshots/` |
| `envkit snapshot restore <name>` | Done | Writes snapshot’s config to `.dev-env.yml` |
| `envkit share export` | Done | `-o <file>` default `dev-env.shared.yml` |
| `envkit share import <file>` | Done | `-o <file>` default `.dev-env.yml` |
| `envkit init` | Done | Interactive wizard to create `.dev-env.yml` |

Global: `-v, --verbose` · `-q, --quiet`

---

## Config schema (project reference)

What the project supports today. Init wizard and docs should stay in sync with this.

| Section | Source | Supported values / shape |
|--------|--------|---------------------------|
| **name** | Required | string (label for this config) |
| **version** | Optional | string (e.g. `"1.0.0"`) |
| **dependencies** | Optional | Array of `{ type, command, path? }`. **Types:** `npm`, `yarn`, `pnpm`, `pip`, `pipenv`, `poetry`, `cargo`, `go`, `custom`. Default `path`: `.` |
| **databases** | Optional | Array of DB configs. **Types:** `postgresql`, `mysql`, `mariadb`, `mongodb`, `redis`, `sqlite`. Fields: name, version, port, host (default localhost), user, password, database, migrations[], seed{ command } |
| **services** | Optional | Array of `{ type, version?, port?, host?, management_port? }`. Type is free string (e.g. rabbitmq). |
| **env** | Optional | Record<string, string>. Use `${VAR}` for secrets. |
| **health_checks** | Optional | Array of `{ name, type, connection_string? }` or `{ name, type, url? }`. |
| **snapshot** | Optional | `include_databases?` (default true), `include_volumes?` (default true), `exclude_paths?` (default `['node_modules', '.git']`). Example also uses `dist`, `build`. |
| **docker** | Optional | `enabled?` (default true), `output_file?` (default `docker-compose.yml`), `network_name?` (default `dev-network`). |

Ref: `src/types/config.ts` (Zod schemas), `.dev-env.example.yml`.

---

## Implementation plan: Init wizard & “no config” flow

**Note:** Init does **not** create a new project. It only creates `.dev-env.yml` for an **existing** project (deps, DB, services, etc.).

Work through these steps in order.

### Step 1: Add dependency

- [x] Add **`prompts`** to `package.json` (runtime dependency).
- [x] Run `npm install`; confirm in `package-lock.json`.
- [x] Add **`@types/prompts`** to devDependencies.
- [x] Add **`tests/dependencies/prompts.test.ts`** (default export is a function).

### Step 2: Init wizard (core)

**Goal:** User has an existing project. `envkit init` only creates `.dev-env.yml` (config for that project). Wizard questions → valid YAML. Required questions minimal; optional ones clearly marked (e.g. “(optional)” or “Skip”).

- [x] Create **`src/commands/init.ts`**.
- [x] **TTY check:** If `!process.stdout.isTTY`, do not run the wizard; log and throw. Export **`isInteractive()`** for the loader.
- [x] **Wizard with `prompts`:** Config name (default from `package.json` or dir), version; dependencies (multiselect types, path/command per type); database (optional, type + fields + migrations/seed); services (optional); env (optional); Docker (optional); snapshot defaults; health check (optional when DB present).
- [x] **Build config:** JS object matching **DevEnvConfig**; validate with **`DevEnvConfigSchema.parse(...)`**.
- [x] **Write:** YAML to `.dev-env.yml`. If file exists, prompt “Overwrite? (y/n)”.
- [x] Export **`runInit(projectRoot: string): Promise<void>`** and **`getDefaultProjectName(projectRoot)`**.
- [x] **Tests:** `tests/commands/init.test.ts` — getDefaultProjectName (from package.json / basename), isInteractive, runInit throws when not TTY.

### Step 3: CLI `envkit init` command

- [x] In **`src/cli/index.ts`**, add **`init`** command. Handler: `findProjectRoot()` then `runInit(projectRoot)`. If not TTY: “Run `envkit init` in a terminal to create a config file.” and exit.
- [x] **Tests:** `--help` includes `init`; `envkit init --help` shows init/wizard. Manually run `envkit init` in a dir without config to confirm (optional).

### Step 4: “No config” helper in loader

- [x] In **`src/core/config/loader.ts`**, add **`loadConfigOrPromptInit(projectRoot): Promise<DevEnvConfig>`**: if `.dev-env.yml` exists → load and return; if missing and not TTY → throw (“create `.dev-env.yml` or run `envkit init`”); if missing and TTY → “No config. Run `envkit init`? (y/n)” → if yes call `runInit(projectRoot)` then load, else throw.
- [x] Loader must be able to import/call `runInit`.

### Step 5: Use the helper in commands

- [x] **Setup, generate, share export, snapshot create:** use `loadConfigOrPromptInit(projectRoot)` instead of `loadConfig(projectRoot)`.
- [x] **Unchanged:** snapshot list, snapshot restore, share import.
- [ ] Manual test: run setup/generate/share export/snapshot create in a project with no config; confirm prompt and init when answering yes.

### Step 6: Tests

- [ ] Init: unit tests for config-building from answers (Zod validation, shape). Optionally YAML write to temp dir.
- [ ] Non-TTY: when `stdout.isTTY` is false, `runInit` does not run wizard and exits with expected message.
- [ ] Optional: CLI e2e for `envkit init` (temp dir, non-interactive/mocked stdin, assert `.dev-env.yml` exists and parses).
- [ ] Full suite: `npm test` passes.

### Step 7: Docs and STATUS

- [ ] **README:** Note that users can run `envkit init` to create `.dev-env.yml` interactively.
- [ ] **DEVELOPMENT.md:** Add `envkit init` and “no config → prompt to run init” in commands / About the package.
- [ ] **STATUS.md:** Mark plan steps done and set `envkit init` to **Done** in the Commands table.

---

## How to test

From the project root:

```bash
npm install
npm test
```

Optional: `npm test -- --coverage`
