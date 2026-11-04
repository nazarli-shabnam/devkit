import * as path from 'path';
import { isInsideDir, assertRelativeOutputInside } from '../../src/utils/paths';

describe('isInsideDir', () => {
  const base = path.resolve('/home/u/proj');

  it('accepts the directory itself and anything below it', () => {
    expect(isInsideDir(base, base)).toBe(true);
    expect(isInsideDir(path.join(base, 'a', 'b.yml'), base)).toBe(true);
    expect(isInsideDir(path.join(base, 'a', '..', 'b.yml'), base)).toBe(true);
  });

  it('rejects the parent, other directories and traversal', () => {
    expect(isInsideDir(path.dirname(base), base)).toBe(false);
    expect(isInsideDir(path.resolve(base, '..', 'other', 'x'), base)).toBe(false);
    expect(isInsideDir(path.resolve(base, '..', '..', 'etc', 'x'), base)).toBe(false);
  });

  it('rejects a sibling that only shares a string prefix', () => {
    expect(isInsideDir(path.resolve('/home/u/proj-evil/x'), base)).toBe(false);
    expect(isInsideDir(path.resolve(base, '..', 'proj-evil', 'x'), base)).toBe(false);
  });

  it('does not reject names that merely start with two dots', () => {
    expect(isInsideDir(path.join(base, '..hidden', 'x'), base)).toBe(true);
  });
});

describe('assertRelativeOutputInside', () => {
  const base = path.resolve('/home/u/proj');

  it('allows relative paths inside, absolute paths, and throws for escaping ones', () => {
    expect(() => assertRelativeOutputInside('out/compose.yml', base)).not.toThrow();
    expect(() => assertRelativeOutputInside(path.resolve('/elsewhere/c.yml'), base)).not.toThrow();
    expect(() => assertRelativeOutputInside('../x.yml', base)).toThrow(/outside the working directory/);
    expect(() => assertRelativeOutputInside('../proj-evil/x.yml', base)).toThrow(/outside the working directory/);
  });
});
