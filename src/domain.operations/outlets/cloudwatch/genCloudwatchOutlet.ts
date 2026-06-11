import type {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  ResourceAlreadyExistsException,
} from '@aws-sdk/client-cloudwatch-logs';

import type { LogEvent, LogOutlet } from '@src/domain.objects/LogOutlet';

/**
 * .what = the AWS CloudWatch Logs SDK module
 * .why = dependency injection removes runtime AWS SDK dependency from sdk-logs
 *
 * .usage
 *   import * as sdkAwsCloudwatch from '@aws-sdk/client-cloudwatch-logs';
 *   genCloudwatchOutlet({ ... }, { cloudwatch: { sdk: sdkAwsCloudwatch } });
 */
export type SdkAwsCloudwatch = {
  CloudWatchLogsClient: typeof CloudWatchLogsClient;
  CreateLogGroupCommand: typeof CreateLogGroupCommand;
  CreateLogStreamCommand: typeof CreateLogStreamCommand;
  PutLogEventsCommand: typeof PutLogEventsCommand;
  ResourceAlreadyExistsException: typeof ResourceAlreadyExistsException;
};

import { asCloudWatchBatches } from './asCloudWatchBatches';
import { asCloudWatchLogEvents } from './asCloudWatchLogEvents';
import { asDefaultLogStreamName } from './asDefaultLogStreamName';
import { asLambdaStyleLogGroupName } from './asLambdaStyleLogGroupName';
import { assertAwsCredentialsPresent } from './assertAwsCredentialsPresent';
import { computeLogEventSize } from './computeLogEventSize';
import { drainBuffer } from './drainBuffer';

/**
 * .what = generates a CloudWatch outlet for log events
 * .why = enables log events to flow to CloudWatch in environments without automatic collection
 *
 * .note = explicit opt-in: add this outlet only when automatic log collection is absent.
 *         AWS Lambda and CloudWatch Agent environments auto-collect console.log output.
 *         in those environments, omit this outlet to avoid duplicate logs.
 *
 * @param input.region - AWS region (required: from option or AWS_REGION/AWS_DEFAULT_REGION env)
 * @param input.logGroup - CloudWatch log group name (default: /aws/lambda/{service}-{env})
 * @param input.logStream - CloudWatch log stream name (default: Lambda-style YYYY/MM/DD/[$LATEST]uuid)
 * @param input.skipLogGroupCreation - skip log group findsert (default: false)
 * @param input.flushInterval - auto-flush interval in ms (default: 5000)
 * @param input.maxBufferSize - buffer size threshold in bytes for force-flush (default: 256000)
 * @param context.cloudwatch.sdk - the @aws-sdk/client-cloudwatch-logs module
 * @param context.cloudwatch.client - optional pre-configured CloudWatchLogsClient
 */
export const genCloudwatchOutlet = (
  input: {
    region?: string;
    logGroup?: string;
    logStream?: string;
    skipLogGroupCreation?: boolean;
    flushInterval?: number;
    maxBufferSize?: number;
  },
  context: {
    cloudwatch: {
      sdk: SdkAwsCloudwatch;
      client?: CloudWatchLogsClient;
    };
  },
): LogOutlet => {
  const {
    region: regionOverride,
    logGroup,
    logStream,
    skipLogGroupCreation,
    flushInterval,
    maxBufferSize,
  } = input;

  const {
    CloudWatchLogsClient: CloudWatchLogsClientClass,
    CreateLogGroupCommand,
    CreateLogStreamCommand,
    PutLogEventsCommand,
    ResourceAlreadyExistsException,
  } = context.cloudwatch.sdk;

  // validate AWS credentials are present (fail-fast)
  assertAwsCredentialsPresent();

  // derive region (explicit > env > fail-fast)
  const region =
    regionOverride ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new Error(
      'CloudWatch outlet requires AWS region. Set AWS_REGION env var or pass region option.',
    );
  }

  // derive defaults
  const logGroupName = logGroup ?? asLambdaStyleLogGroupName();
  const logStreamName = logStream ?? asDefaultLogStreamName();

  // use provided client or create from sdk (sdk uses AWS_REGION env var)
  const client = context.cloudwatch.client ?? new CloudWatchLogsClientClass({});

  // buffer for events
  const buffer: LogEvent[] = [];
  let bufferSize = 0; // track size incrementally for O(1) checks
  let initialized = false;
  let flushPromise: Promise<void> | null = null;

  // setup auto-flush with explicit crash on error
  const intervalMs = flushInterval ?? 5_000; // 5s default for faster emission
  const bufferLimit = maxBufferSize ?? 256_000; // 256KB default for frequent flushes
  const flushTimer = setInterval(() => {
    flush().catch((error) => {
      console.error('CloudWatch flush failed:', error);
      process.exit(1);
    });
  }, intervalMs);
  flushTimer.unref(); // allow process to exit despite timer

  // register process exit hooks (beforeExit keeps event loop alive for promises)
  const handleExitFlush = () => {
    flush()
      .catch((error) => {
        console.error('CloudWatch flush failed during exit:', error);
      })
      .finally(() => {
        close();
      });
  };
  process.once('beforeExit', handleExitFlush);

  // signal handlers: flush then exit (promise chain keeps event loop alive)
  let exitInProgress = false;
  const handleSignalExit = (exitCode: number) => {
    if (exitInProgress) return;
    exitInProgress = true;
    flush()
      .catch((error) => {
        console.error('CloudWatch flush failed during signal exit:', error);
      })
      .finally(() => {
        close();
        process.exit(exitCode);
      });
  };
  const handleSigterm = () => handleSignalExit(143); // 128 + 15 (SIGTERM)
  const handleSigint = () => handleSignalExit(130); // 128 + 2 (SIGINT)
  process.once('SIGTERM', handleSigterm);
  process.once('SIGINT', handleSigint);

  /**
   * .what = close the outlet and release resources
   * .why = cleans up timers and process listeners to prevent leaks in tests
   */
  const close = () => {
    clearInterval(flushTimer);
    process.removeListener('beforeExit', handleExitFlush);
    process.removeListener('SIGTERM', handleSigterm);
    process.removeListener('SIGINT', handleSigint);
  };

  /**
   * .what = findsert log group
   * .why = idempotent creation via ResourceAlreadyExistsException
   */
  const findsertLogGroup = async () => {
    try {
      await client.send(new CreateLogGroupCommand({ logGroupName }));
    } catch (error) {
      if (error instanceof ResourceAlreadyExistsException) return;
      throw error;
    }
  };

  /**
   * .what = findsert log stream
   * .why = idempotent creation via ResourceAlreadyExistsException
   */
  const findsertLogStream = async () => {
    try {
      await client.send(
        new CreateLogStreamCommand({ logGroupName, logStreamName }),
      );
    } catch (error) {
      if (error instanceof ResourceAlreadyExistsException) return;
      throw error;
    }
  };

  /**
   * .what = initialize log group and stream
   * .why = lazy initialization on first flush
   */
  const init = async () => {
    if (initialized) return;
    if (!skipLogGroupCreation) await findsertLogGroup();
    await findsertLogStream();
    initialized = true;
  };

  /**
   * .what = flush buffered events to CloudWatch
   * .why = batch send for efficiency (max 1MB, 10k events per CloudWatch limits)
   *
   * .invariant = single-flush-at-a-time via flushPromise
   *   - concurrent flush() calls wait on extant flushPromise
   *   - after wait, recheck buffer for events added mid-flush
   *   - recursive call handles events that arrived while awaited
   *   - prevents concurrent PutLogEvents calls (CloudWatch sequence token issues)
   */
  const flush = async (): Promise<void> => {
    // if no events, skip
    if (buffer.length === 0) return;

    // if flush in progress, wait then recheck for new events
    if (flushPromise) {
      await flushPromise;
      if (buffer.length > 0) return flush(); // recheck for events added while wait
      return;
    }

    // start flush
    flushPromise = (async () => {
      // extract events from buffer (restore on failure)
      const events = drainBuffer(buffer);
      const eventsSizeSnapshot = bufferSize;
      bufferSize = 0;

      try {
        await init();

        // split into CloudWatch-compliant batches (max 1MB, 10k events each)
        const batches = asCloudWatchBatches(events);
        for (const batch of batches) {
          await client.send(
            new PutLogEventsCommand({
              logGroupName,
              logStreamName,
              logEvents: asCloudWatchLogEvents(batch),
            }),
          );
        }
      } catch (error) {
        // restore events to buffer on failure (prepend to preserve order)
        buffer.unshift(...events);
        bufferSize += eventsSizeSnapshot;
        throw error;
      } finally {
        flushPromise = null;
      }
    })();

    await flushPromise;
  };

  return {
    send: (event: LogEvent) => {
      // track size incrementally (O(1) vs O(n) for full buffer stringify)
      const eventSize = computeLogEventSize(event);
      bufferSize += eventSize;
      buffer.push(event);

      // force-flush if buffer exceeds size limit (explicit crash on error)
      if (bufferSize > bufferLimit) {
        flush().catch((error) => {
          console.error('CloudWatch flush failed:', error);
          process.exit(1);
        });
      }
    },
    flush,
    close,
  };
};
