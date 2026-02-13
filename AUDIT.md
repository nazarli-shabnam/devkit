# Project audit: bugs and improvements

Summary of a full project review: bugs found (and fixed), minor issues, and improvement ideas.

---

## Bugs fixed

### 1. YAML error detection in config loader

- **File:** `src/core/config/loader.ts`
- **Issue:** YAML parse errors from `js-yaml` use `error.name === 'YAMLException'`. The code only checked `error.message.includes('YAMLException')`, which can miss wrapped or rethrown errors.
- **Fix:** Detection now uses `error.name === 'YAMLException'` and falls back to checking the message for `'YAML'` so parse failures are always reported as config syntax errors.

### 2. Share export: validate sanitized config before writing

- **File:** `src/commands/share.ts`
- **Issue:** After `sanitizeConfigForShare()`, the result was dumped to YAML without re-validation. If the schema or sanitization logic drifted, invalid config could be written.
- **Fix:** Run `DevEnvConfigSchema.parse(sanitized)` before writing so invalid output is caught and not written.

---

## Minor issues (no code change)

- **Validator “password” warning:** In `validator.ts`, the warning “Passwords detected in configuration file” uses `configStr.includes('password')`. Keys like `password_reset_url` can trigger a false positive. Consider checking only known secret keys (e.g. `db.password`, `env` entries) or key names that equal `password`.
- **path-setup Windows:** The path passed to PowerShell is escaped for double quotes. Paths containing backticks or other PowerShell metacharacters could theoretically break. Rare in practice; could be hardened with stricter escaping if needed.
- **Snapshot list without config:** `snapshot list` uses only `findProjectRoot()` and does not require `.dev-env.yml`. If the “root” is found via a marker (e.g. `package.json`) and there is no `.devkit/snapshots`, the list is empty. This is correct; no bug.

---

## Improvement ideas

1. **`envkit validate`**  
   A command that only loads and validates `.dev-env.yml` (and optional `.env`) and exits 0/1. Useful for CI and pre-commit checks without running setup or generate.

2. **Snapshot restore confirmation**  
   Before overwriting `.dev-env.yml`, optionally prompt “Overwrite current config?” (or support `--yes` for non-interactive). Reduces risk of losing local edits.

3. **Seed command path**  
   Database seed currently runs with `cwd: projectRoot`. Adding a `path` for seed (like migrations) would allow seeds in a subdirectory (e.g. `./scripts`).

4. **Init: custom dependency**  
   The wizard allows “custom” with an empty command. Setup would then run an empty command and fail. Consider validating non-empty command for `custom` or showing a warning in init.

5. **PATH order on Unix**  
   `path-setup` appends the bin directory to `PATH`. Some users prefer prepending so the installed `envkit` takes precedence over others. Could be an option (e.g. `--prepend`) or documented as a manual alternative.

6. **Health checks in generated Compose**  
   The Handlebars template has an optional `healthcheck` block per service, but `compose-generator.ts` does not populate it. Adding health check generation from config (e.g. from `health_checks` or DB type) would make generated Compose more production-like.

7. **Dry-run for generate**  
   `envkit generate --dry-run` could print the generated YAML to stdout without writing a file, for piping or inspection.

8. **Share import: optional validation only**  
   Add a flag like `envkit share import --validate-only <file>` that validates the file and exits without writing, useful in CI.

9. **Doc: import path resolution**  
   In README, clarify that the path in `envkit share import <file>` is resolved relative to the current working directory, not the project root.

10. **Tests for loader YAML error path**  
    Add a test that passes invalid YAML and asserts the thrown error message mentions the config file and syntax.

---

## Summary

- **2 bugs fixed:** YAML error detection in loader; share export validation before write.
- **3 minor issues noted** (validator false positive, path-setup escaping, snapshot list behavior).
- **10 improvement ideas** listed for future consideration.

All other reviewed areas (config loading, findProjectRoot, setup/generate/snapshot/share, exec, file-ops, compose generator, path-setup, logger, platform) behaved as intended with no additional bugs found.
