import type { Environment } from 'sdk-environment';

import type { LogLevel } from '@src/domain.objects/constants';

/**
 * .what = a log method that outputs a message with optional metadata
 */
export type LogMethod = (message: string, metadata?: any) => void;

/**
 * .what = the log methods available for use
 */
export interface LogMethods {
  /**
   * `error` level logs are used to indicate a critical and urgent failure that requires immediate resolution
   * - these logs are often associated with someone on-call being notified immediately, regardless of the time or day
   * - when choosing to log something with a log level of "error", you are saying that someone should be woken up in the middle of the night if this occurs
   */
  error: LogMethod;

  /**
   * `warn` level logs are used to indicate that something is going wrong, but can wait to be resolved until a convenient time
   * - these logs are often associated with someone following up on them during business hours
   * - when choosing to log something with a log level of "warn", you are saying that someone should look at this as soon as reasonably possible
   */
  warn: LogMethod;

  /**
   * `info` level logs are used to indicate an interesting event that should be kept track of
   * - these logs are often associated with health metrics, dashboard statistics, or custom log queries for investigations or reporting
   * - when choosing to log something with a log level of "info", you are saying that someone will be interested in this information indefinitely
   */
  info: LogMethod;

  /**
   * `debug` level logs are used to output information that can aid users in tracking down bugs or confirming that things are working as expected
   * - these logs are often associated with common actions that happen within code, that may only be relevant when debugging your applications
   * - when choosing to log something with a log level of "debug", you are saying that someone will only be interested in this information when debugging
   */
  debug: LogMethod;

  /**
   * .what = internal config for log methods
   */
  readonly _: Readonly<{ level: LogLevel }>;

  /**
   * .what = the environment context baked into these log methods
   * .why = enables withLogTrail to inherit env from outer log
   */
  readonly env?: Partial<Environment>;
}
