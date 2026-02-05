import prompts from 'prompts';

describe('prompts dependency', () => {
  it('exports a function as default', () => {
    expect(typeof prompts).toBe('function');
  });

});
