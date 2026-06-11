import { given, then, when } from 'test-fns';

import { genContextLogTrail } from '@src/index';

const maskTimestamp = (log: Record<string, unknown>) => ({
  ...log,
  timestamp: '[masked]',
});

describe('journey: exid unknown at entry point', () => {
  given('[case1] background job without request id', () => {
    when('[t0] context created with null exid', () => {
      then('logs work without exid field', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const context = genContextLogTrail({
          trail: { exid: null, stack: [] },
          env: { commit: 'a1b2c3d' },
        });

        context.log.info('job started', { jobType: 'cleanup' });

        const output = consoleSpy.mock.calls[0]?.[0];
        expect(maskTimestamp(output)).toMatchSnapshot();
        consoleSpy.mockRestore();
      });
    });
  });
});
