import type { Procedure, ProcedureContext } from 'domain-glossary-procedure';
import type { Environment } from 'sdk-environment';

import type { LogMethods } from '@src/domain.objects/LogMethods';

/**
 * .what = the procedure invocation trail with external identifier
 */
export interface LogTrail {
  /**
   * .what = external identifier for request correlation
   * .why = enables log correlation across a single request
   */
  exid: string | null;

  /**
   * .what = the procedure call stack
   * .why = tracks call depth through withLogTrail wraps
   */
  stack: string[];
}

export interface ContextLogTrail {
  /**
   * .what = the log context which can be used; methods, trail, etc
   */
  log: LogMethods & {
    // todo: support ".scope" as a first class attribute of log methods to avoid having to track original log object
    _orig?: LogMethods;

    /**
     * .what = the log trail which has been collected
     */
    trail?: LogTrail;

    /**
     * .what = environment context for log output
     */
    env?: Partial<Environment>;
  };
}

export type HasContextLogTrail<T extends Procedure> =
  ProcedureContext<T> extends ContextLogTrail ? T : never;
