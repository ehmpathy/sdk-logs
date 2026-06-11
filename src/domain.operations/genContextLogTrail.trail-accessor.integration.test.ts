import { given, then, when } from 'test-fns';

import { genContextLogTrail } from '@src/index';

describe('journey: trail state accessible for serialization', () => {
  given('[case1] context with trail', () => {
    when('[t0] context.log.trail is accessed', () => {
      then('returns current trail for cross-service pass', () => {
        const context = genContextLogTrail({
          trail: { exid: 'req_abc123', stack: ['processOrder'] },
          env: { commit: 'a1b2c3d' },
        });

        const trailState = context.log.trail;

        // this is what gets passed to downstream services
        expect(trailState).toMatchSnapshot();
      });
    });
  });
});
