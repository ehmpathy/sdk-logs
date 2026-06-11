import type { Environment } from 'sdk-environment';

import { LogLevel } from '@src/domain.objects/constants';
import type { LogEvent, LogOutlet } from '@src/domain.objects/LogOutlet';
import type { LogTrail } from '@src/domain.objects/LogTrail';

import { asCurrentIsoTimestamp } from './asCurrentIsoTimestamp';
import { formatLogContentsForEnvironment } from './formatLogContentsForEnvironment';

// re-export for backwards compatibility
export type { LogMethod } from '@src/domain.objects/LogMethods';

/*
  define priority order of log levels and make it easy to ask questions about
*/
const logLevelPriorityOrder = [
  LogLevel.ERROR,
  LogLevel.WARN,
  LogLevel.INFO,
  LogLevel.DEBUG,
];
const aIsEqualOrMoreImportantThanB = ({ a, b }: { a: LogLevel; b: LogLevel }) =>
  logLevelPriorityOrder.indexOf(a) - logLevelPriorityOrder.indexOf(b) <= 0;

/*
  define how to generate a log method
  - i.e.,:
    - define when allowed to emit a log (i.e., when level > minimalLogLevel)
    - define the format of the log message (json w/ level, timestamp, message, metadata)
    - define the transport of the message (console.log / console.warn)
*/
export const generateLogMethod = ({
  level,
  minimalLogLevel,
  trail,
  env,
  outlets,
}: {
  level: LogLevel;
  minimalLogLevel: LogLevel;
  trail?: LogTrail;
  env?: Partial<Environment>;
  outlets?: LogOutlet[];
}) => {
  return (message: string, metadata?: object) => {
    // check level threshold
    if (!aIsEqualOrMoreImportantThanB({ a: level, b: minimalLogLevel })) return;

    // create timestamp once for consistency
    const timestamp = asCurrentIsoTimestamp();

    // determine the console level (i.e., use warn if we can to make the logs stand out more)
    const consoleMethod = aIsEqualOrMoreImportantThanB({
      a: level,
      b: LogLevel.WARN,
    })
      ? console.warn
      : console.log; // tslint:disable-line no-console

    // output the message to console, which will get picked up by cloudwatch when deployed lambda is invoked
    consoleMethod(
      formatLogContentsForEnvironment({
        level,
        timestamp,
        message,
        metadata,
        trail,
        env,
      }),
    );

    // dispatch to outlets (fail-fast: errors propagate to caller)
    if (outlets && outlets.length > 0) {
      const event: LogEvent = {
        level,
        timestamp,
        message,
        metadata: metadata as Record<string, unknown> | undefined,
        env,
      };
      for (const outlet of outlets) {
        outlet.send(event);
      }
    }
  };
};
