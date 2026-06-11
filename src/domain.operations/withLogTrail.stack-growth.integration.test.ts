import { given, then, when } from 'test-fns';

import { genContextLogTrail, LogLevel, withLogTrail } from '@src/index';

const maskTimestamp = (log: Record<string, unknown>) => ({
  ...log,
  timestamp: '[masked]',
});

describe('journey: withLogTrail grows stack automatically', () => {
  given('[case1] wrapped procedure emits logs', () => {
    when('[t0] procedure is called', () => {
      then('stack includes procedure name', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const context = genContextLogTrail({
          trail: { exid: 'req_abc123', stack: [] },
          env: { commit: 'a1b2c3d' },
          level: { minimum: LogLevel.DEBUG },
        });

        const processOrder = withLogTrail(
          async (input: { orderId: string }, ctx: typeof context) => {
            ctx.log.info('order started', { orderId: input.orderId });
            return { success: true };
          },
          { name: 'processOrder' },
        );

        processOrder({ orderId: 'ord_123' }, context);

        // find the 'order started' log (skip the input log)
        const orderStartedLog = consoleSpy.mock.calls.find((call) =>
          call[0]?.message?.includes('order started'),
        )?.[0];
        expect(maskTimestamp(orderStartedLog)).toMatchSnapshot();
        consoleSpy.mockRestore();
      });
    });
  });

  given('[case2] nested procedures', () => {
    when('[t0] inner procedure emits logs', () => {
      then('stack shows full path: outer -> inner', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const context = genContextLogTrail({
          trail: { exid: 'req_abc123', stack: [] },
          env: { commit: 'a1b2c3d' },
          level: { minimum: LogLevel.DEBUG },
        });

        const validateInventory = withLogTrail(
          async (_input: unknown, ctx: typeof context) => {
            ctx.log.info('check stock');
            return { available: true };
          },
          { name: 'validateInventory' },
        );

        const processOrder = withLogTrail(
          async (input: { orderId: string }, ctx: typeof context) => {
            ctx.log.info('order started');
            await validateInventory(input, ctx);
            return { success: true };
          },
          { name: 'processOrder' },
        );

        processOrder({ orderId: 'ord_123' }, context);

        // find the 'check stock' log from inner procedure
        const checkStockLog = consoleSpy.mock.calls.find((call) =>
          call[0]?.message?.includes('check stock'),
        )?.[0];
        expect(maskTimestamp(checkStockLog)).toMatchSnapshot();
        consoleSpy.mockRestore();
      });
    });
  });
});
