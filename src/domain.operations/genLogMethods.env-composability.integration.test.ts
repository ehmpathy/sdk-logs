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

describe('journey: genLogMethods with env composability', () => {
  given('[case1] global logger with env baked in', () => {
    when('[t0] wrapped operation logs via withLogTrail', () => {
      then('nested logs inherit env from global logger', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        // the core wish: global singleton with env, no trail ceremony
        const globalLog = genLogMethods({
          level: { minimum: LogLevel.DEBUG },
          env: { commit: 'main@abc123' },
        });

        // create context that withLogTrail expects
        const context: ContextLogTrail = {
          log: {
            ...globalLog,
            trail: undefined, // no trail for global logger
          },
        };

        // wrap an operation
        const processOrder = withLogTrail(
          async (input: { orderId: string }, ctx: typeof context) => {
            ctx.log.info('order processed', { orderId: input.orderId });
            return { success: true };
          },
          { name: 'processOrder' },
        );

        processOrder({ orderId: 'ord_456' }, context);

        // find the progress log
        const progressLog = consoleSpy.mock.calls.find((call) =>
          call[0]?.message?.includes('order processed'),
        )?.[0];

        expect(maskTimestamp(progressLog)).toMatchSnapshot();

        // explicit assertion: env is inherited
        expect(progressLog.env).toEqual({ commit: 'main@abc123' });

        consoleSpy.mockRestore();
      });
    });
  });

  given('[case2] env precedence: genContextLogTrail env vs inherited', () => {
    when('[t0] genContextLogTrail provides different env', () => {
      then('per-request env wins over inherited env', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        // global logger with one commit
        const globalLog = genLogMethods({
          level: { minimum: LogLevel.DEBUG },
          env: { commit: 'global@111' },
        });

        // per-request context with different commit
        const requestContext = genContextLogTrail({
          trail: { exid: 'req_xyz', stack: [] },
          env: { commit: 'request@222' }, // different from global
          level: { minimum: LogLevel.DEBUG },
        });

        // wrap an operation
        const handleRequest = withLogTrail(
          async (_input: unknown, ctx: typeof requestContext) => {
            ctx.log.info('request handled');
            return { done: true };
          },
          { name: 'handleRequest' },
        );

        handleRequest({}, requestContext);

        // find the progress log
        const progressLog = consoleSpy.mock.calls.find((call) =>
          call[0]?.message?.includes('request handled'),
        )?.[0];

        expect(maskTimestamp(progressLog)).toMatchSnapshot();

        // explicit assertion: per-request env wins
        expect(progressLog.env).toEqual({ commit: 'request@222' });

        consoleSpy.mockRestore();
      });
    });
  });

  given('[case3] global logger without trail, just env', () => {
    when('[t0] direct log call (no withLogTrail)', () => {
      then('log includes env.commit', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        // the simplest case: genLogMethods + env, no trail
        const log = genLogMethods({
          level: { minimum: LogLevel.DEBUG },
          env: { commit: 'deploy@v1.2.3' },
        });

        log.info('server started', { port: 3000 });

        const logOutput = consoleSpy.mock.calls[0]?.[0];
        expect(maskTimestamp(logOutput)).toMatchSnapshot();

        // explicit assertion: env is present
        expect(logOutput.env).toEqual({ commit: 'deploy@v1.2.3' });

        consoleSpy.mockRestore();
      });
    });
  });
});
