import { logger, LogLevel } from '../../src/utils/logger';

describe('--quiet (level ERROR) suppresses progress and success lines', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  const original = logger.getLevel();

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation();
    warn = jest.spyOn(console, 'warn').mockImplementation();
    error = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    logger.setLevel(original);
    jest.restoreAllMocks();
  });

  it('hides success, step and info; keeps errors', () => {
    logger.setLevel(LogLevel.ERROR);
    logger.success('done');
    logger.step('working');
    logger.info('fyi');
    logger.warn('careful');
    logger.error('broken');
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('broken'));
  });

  it('still prints requested data via output()', () => {
    logger.setLevel(LogLevel.ERROR);
    logger.output('snapshot-a');
    expect(log).toHaveBeenCalledWith('snapshot-a');
  });

  it('shows success and step at the default and verbose levels', () => {
    for (const level of [LogLevel.INFO, LogLevel.DEBUG]) {
      log.mockClear();
      logger.setLevel(level);
      logger.success('done');
      logger.step('working');
      expect(log).toHaveBeenCalledTimes(2);
    }
  });

  it('hides success and step at the WARN level too', () => {
    logger.setLevel(LogLevel.WARN);
    logger.success('done');
    logger.step('working');
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
