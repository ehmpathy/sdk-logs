import { given, then, when } from 'test-fns';

import { genContextLogTrail } from '@src/index';

const maskTimestamp = (log: Record<string, unknown>) => ({
  ...log,
  timestamp: '[masked]',
});

describe('journey: commit unavailable', () => {
  given('[case1] local dev without COMMIT_SHA', () => {
    when('[t0] context created with empty env', () => {
      then('logs work without env field', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const context = genContextLogTrail({
          trail: { exid: 'req_abc123', stack: [] },
          env: {},
        });

        context.log.info('local dev log');

        const output = consoleSpy.mock.calls[0]?.[0];
        expect(maskTimestamp(output)).toMatchSnapshot();
        consoleSpy.mockRestore();
      });
    });
  });
});
