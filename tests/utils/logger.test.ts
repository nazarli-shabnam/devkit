import { logger, LogLevel } from '../../src/utils/logger';

describe('logger', () => {
  let consoleSpy: { debug: jest.SpyInstance; log: jest.SpyInstance; warn: jest.SpyInstance; error: jest.SpyInstance };

  beforeEach(() => {
    consoleSpy = {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    logger.setLevel(LogLevel.INFO);
    Object.values(consoleSpy).forEach((s) => s.mockRestore());
  });

  it('setLevel changes verbosity', () => {
    logger.setLevel(LogLevel.ERROR);
    logger.info('should not appear');
    expect(consoleSpy.log).not.toHaveBeenCalled();
    logger.error('should appear');
    expect(consoleSpy.error).toHaveBeenCalled();
  });

  it('debug is not emitted at INFO level', () => {
    logger.setLevel(LogLevel.INFO);
    logger.debug('hidden');
    expect(consoleSpy.debug).not.toHaveBeenCalled();
  });

  it('debug is emitted at DEBUG level', () => {
    logger.setLevel(LogLevel.DEBUG);
    logger.debug('visible');
    expect(consoleSpy.debug).toHaveBeenCalled();
  });

  it('info and success call console', () => {
    logger.info('info message');
    expect(consoleSpy.log).toHaveBeenCalled();
    logger.success('done');
    expect(consoleSpy.log).toHaveBeenCalledTimes(2);
  });
});
