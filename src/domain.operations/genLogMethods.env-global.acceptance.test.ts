import { given, then, when } from 'test-fns';

import type { ContextLogTrail } from '@src/domain.objects/LogTrail';
import {
  genContextLogTrail,
  genLogMethods,
  LogLevel,
  withLogTrail,
} from '@src/index';

const maskTimestamp = (log: Record<string, unknown>) => ({
  ...log,
  timestamp: '[masked]',
});

describe('journey: global env.commit flows through all log paths', () => {
  given('[case1] person sets env.commit globally', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // setup: global logger with env baked in
    const globalLog = genLogMethods({
      level: { minimum: LogLevel.DEBUG },
      env: { commit: 'global@abc123' },
    });

    afterEach(() => consoleSpy.mockClear());
    afterAll(() => consoleSpy.mockRestore());

    when('[t0] they call the logger directly', () => {
      then('commit is logged with it', () => {
        globalLog.info('direct log call', { action: 'boot' });

        const logOutput = consoleSpy.mock.calls[0]?.[0];
        expect(maskTimestamp(logOutput)).toMatchSnapshot();
        expect(logOutput.env).toEqual({ commit: 'global@abc123' });
      });
    });

    when(
      '[t1] they pass the logger into a withLogTrail-wrapped function',
      () => {
        then('context.log.info logs the global env', () => {
          // wrap a function with withLogTrail
          const sayHello = withLogTrail(
            (_input: unknown, context: ContextLogTrail) => {
              context.log.info('hello from wrapped function');
              return { greeted: true };
            },
            { name: 'sayHello' },
          );

          // pass genLogMethods as the log context
          sayHello({}, { log: { ...globalLog, trail: undefined } });

          // find the progress log (not the input/output logs)
          const progressLog = consoleSpy.mock.calls.find((call) =>
            call[0]?.message?.includes('hello from wrapped function'),
          )?.[0];

          expect(maskTimestamp(progressLog)).toMatchSnapshot();
          expect(progressLog.env).toEqual({ commit: 'global@abc123' });
        });
      },
    );

    when(
      '[t2] they pass the logger into a genContextLogTrail that has its own env supplied',
      () => {
        then(
          'the more specific newly supplied env wins, whenever context.log.info is called',
          () => {
            // create per-request context with different env
            const requestContext = genContextLogTrail({
              trail: { exid: 'req_002', stack: [] },
              env: { commit: 'request@xyz789' }, // overrides global
              level: { minimum: LogLevel.DEBUG },
            });

            requestContext.log.info('via request context', { handler: 'api' });

            const logOutput = consoleSpy.mock.calls[0]?.[0];
            expect(maskTimestamp(logOutput)).toMatchSnapshot();
            expect(logOutput.env).toEqual({ commit: 'request@xyz789' });
          },
        );

        then(
          'the original env is preserved, whenever log is called directly',
          () => {
            // first: call via request context (different env)
            const requestContext = genContextLogTrail({
              trail: { exid: 'req_003', stack: [] },
              env: { commit: 'request@xyz789' },
              level: { minimum: LogLevel.DEBUG },
            });
            requestContext.log.info('request log');

            // second: call global logger directly
            globalLog.info('global log after request');

            // verify request log has request env
            const requestLogOutput = consoleSpy.mock.calls[0]?.[0];
            expect(requestLogOutput.env).toEqual({ commit: 'request@xyz789' });

            // verify global log still has global env
            const globalLogOutput = consoleSpy.mock.calls[1]?.[0];
            expect(maskTimestamp(globalLogOutput)).toMatchSnapshot();
            expect(globalLogOutput.env).toEqual({ commit: 'global@abc123' });
          },
        );
      },
    );
  });
});
