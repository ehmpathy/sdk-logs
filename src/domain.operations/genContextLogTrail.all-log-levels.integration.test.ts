import { given, then, when } from 'test-fns';

import { genContextLogTrail, LogLevel } from '@src/index';

const maskTimestamp = (log: Record<string, unknown>) => ({
  ...log,
  timestamp: '[masked]',
});

describe('journey: all log levels include trail', () => {
  given('[case1] context with trail and env', () => {
    when('[t0] debug is called', () => {
      then('output includes trail', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const context = genContextLogTrail({
          trail: { exid: 'req_abc123', stack: [] },
          env: { commit: 'a1b2c3d' },
          level: { minimum: LogLevel.DEBUG },
        });

        context.log.debug('debug message', { detail: 'verbose' });

        const output = consoleSpy.mock.calls[0]?.[0];
        expect(maskTimestamp(output)).toMatchSnapshot();
        consoleSpy.mockRestore();
      });
    });

    when('[t1] info is called', () => {
      then('output includes trail', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const context = genContextLogTrail({
          trail: { exid: 'req_abc123', stack: [] },
          env: { commit: 'a1b2c3d' },
        });

        context.log.info('info message', { status: 'ok' });

        const output = consoleSpy.mock.calls[0]?.[0];
        expect(maskTimestamp(output)).toMatchSnapshot();
        consoleSpy.mockRestore();
      });
    });

    when('[t2] warn is called', () => {
      then('output includes trail', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const context = genContextLogTrail({
          trail: { exid: 'req_abc123', stack: [] },
          env: { commit: 'a1b2c3d' },
        });

        context.log.warn('warn message', { issue: 'slow response' });

        const output = consoleSpy.mock.calls[0]?.[0];
        expect(maskTimestamp(output)).toMatchSnapshot();
        consoleSpy.mockRestore();
      });
    });

    when('[t3] error is called', () => {
      then('output includes trail', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const context = genContextLogTrail({
          trail: { exid: 'req_abc123', stack: [] },
          env: { commit: 'a1b2c3d' },
        });

        context.log.error('error message', { err: 'connection failed' });

        const output = consoleSpy.mock.calls[0]?.[0];
        expect(maskTimestamp(output)).toMatchSnapshot();
        consoleSpy.mockRestore();
      });
    });
  });
});
