import type { Environment } from 'sdk-environment';

import { LogLevel } from '@src/domain.objects/constants';
import type { LogMethods } from '@src/domain.objects/LogMethods';
import type { LogOutlet } from '@src/domain.objects/LogOutlet';

import { generateLogMethod } from './generateLogMethod';
import { getRecommendedMinimalLogLevelForEnvironment } from './getRecommendedMinimalLogLevelForEnvironment';

// re-export for backwards compatibility
export type { LogMethod, LogMethods } from '@src/domain.objects/LogMethods';

/**
 * define how to generate the log methods
 * - allows you to specify the minimal log level to use for your application
 * - defaults to recommended levels for the environment
 * - allows you to specify outlets for log events to flow to external destinations
 * - allows you to specify env for environment context (e.g., commit hash)
 */
export const genLogMethods = ({
  level,
  outlets,
  env,
}: {
  level?: { minimum?: LogLevel };
  outlets?: LogOutlet[];
  env?: Partial<Environment> | null;
} = {}): LogMethods => {
  // derive minimal log level
  const derivedMinimalLogLevel =
    level?.minimum ?? getRecommendedMinimalLogLevelForEnvironment();

  // convert null to undefined for internal use
  const envForLog = env ?? undefined;

  // generate the methods
  return {
    error: generateLogMethod({
      level: LogLevel.ERROR,
      minimalLogLevel: derivedMinimalLogLevel,
      outlets,
      env: envForLog,
    }),
    warn: generateLogMethod({
      level: LogLevel.WARN,
      minimalLogLevel: derivedMinimalLogLevel,
      outlets,
      env: envForLog,
    }),
    info: generateLogMethod({
      level: LogLevel.INFO,
      minimalLogLevel: derivedMinimalLogLevel,
      outlets,
      env: envForLog,
    }),
    debug: generateLogMethod({
      level: LogLevel.DEBUG,
      minimalLogLevel: derivedMinimalLogLevel,
      outlets,
      env: envForLog,
    }),
    _: Object.freeze({ level: derivedMinimalLogLevel }),
    env: envForLog,
  };
};
