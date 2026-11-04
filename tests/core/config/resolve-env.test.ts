import { resolveEnvVars } from '../../../src/core/config/loader';
import { logger } from '../../../src/utils/logger';

describe('resolveEnvVars: defaults, escapes, single pass', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'warn').mockImplementation();
    delete process.env.RV_UNSET;
    delete process.env.RV_EMPTY;
    delete process.env.RV_SET;
    delete process.env.RV_SECRET;
  });
  afterEach(() => {
    delete process.env.RV_EMPTY;
    delete process.env.RV_SET;
    delete process.env.RV_SECRET;
    jest.restoreAllMocks();
  });

  it('uses the default when the variable is unset, without warning', () => {
    expect(resolveEnvVars('${RV_UNSET:-5432}')).toBe('5432');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('uses the default when the variable is set but empty (shell :- semantics)', () => {
    process.env.RV_EMPTY = '';
    expect(resolveEnvVars('${RV_EMPTY:-fallback}')).toBe('fallback');
  });

  it('ignores the default when the variable has a value', () => {
    process.env.RV_SET = 'real';
    expect(resolveEnvVars('${RV_SET:-fallback}')).toBe('real');
  });

  it('allows an empty default and a default containing colons or other references', () => {
    process.env.RV_SET = 'x';
    expect(resolveEnvVars('a${RV_UNSET:-}b')).toBe('ab');
    expect(resolveEnvVars('${RV_UNSET:-http://h:1}')).toBe('http://h:1');
  });

  it('treats $${VAR} as an escape for a literal ${VAR} and does not report it', () => {
    const unresolved = new Set<string>();
    expect(resolveEnvVars('pg_isready -U $${POSTGRES_USER}', {}, unresolved)).toBe('pg_isready -U ${POSTGRES_USER}');
    expect(unresolved.size).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not re-expand values that came from the process environment', () => {
    process.env.RV_SECRET = 'pa${RV_SET}ss';
    process.env.RV_SET = 'LEAK';
    expect(resolveEnvVars('${RV_SECRET}')).toBe('pa${RV_SET}ss');
  });

  it('expands env-block values recursively', () => {
    expect(resolveEnvVars('${OUTER}', { OUTER: '${INNER}-x', INNER: 'final' })).toBe('final-x');
    expect(resolveEnvVars('${OUTER}', { OUTER: 'esc $${INNER}', INNER: 'final' })).toBe('esc ${INNER}');
  });

  it('reads the ambient value when an env-block entry refers to its own name', () => {
    process.env.RV_SET = 'from-env';
    expect(resolveEnvVars('${RV_SET}', { RV_SET: '${RV_SET}' })).toBe('from-env');
    expect(resolveEnvVars('${RV_SET}', { RV_SET: '${RV_SET}:/extra' })).toBe('from-env:/extra');
  });

  it('cannot recurse forever on mutually recursive definitions', () => {
    expect(resolveEnvVars('${A}', { A: '${B}', B: '${A}' })).toBe('${A}');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('is not set'));
  });

  it('still reports (and keeps) unset variables without a default', () => {
    const unresolved = new Set<string>();
    expect(resolveEnvVars('x ${RV_UNSET} y', {}, unresolved)).toBe('x ${RV_UNSET} y');
    expect([...unresolved]).toEqual(['RV_UNSET']);
  });
});
