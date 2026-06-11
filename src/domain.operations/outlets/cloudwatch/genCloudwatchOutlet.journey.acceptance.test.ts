import * as sdkAwsCloudwatch from '@aws-sdk/client-cloudwatch-logs';
import { randomUUID } from 'crypto';
import { given, then, when } from 'test-fns';

import { LogLevel } from '@src/domain.objects/constants';
import type { LogEvent } from '@src/domain.objects/LogOutlet';

import { genCloudwatchOutlet } from './genCloudwatchOutlet';

const { CloudWatchLogsClient, DeleteLogGroupCommand, GetLogEventsCommand } =
  sdkAwsCloudwatch;

/**
 * .what = check if AWS credentials are available
 * .why = skip acceptance tests when credentials absent (e.g., CI without OIDC)
 * .note = mirrors assertAwsCredentialsPresent logic but returns boolean
 */
const hasAwsCredentials = (): boolean => {
  const hasEnvCredentials =
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
  const hasProfile = process.env.AWS_PROFILE;
  const hasRoleArn = process.env.AWS_ROLE_ARN;
  const hasWebIdentity =
    process.env.AWS_WEB_IDENTITY_TOKEN_FILE && process.env.AWS_ROLE_ARN;
  const hasContainerCredentials =
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  const hasMetadataService = process.env.AWS_EXECUTION_ENV;

  return !!(
    hasEnvCredentials ||
    hasProfile ||
    hasRoleArn ||
    hasWebIdentity ||
    hasContainerCredentials ||
    hasMetadataService
  );
};

/**
 * .what = derive region for test
 * .why = provides consistent region for outlet and verification client
 */
const getTestRegion = (): { region: string } => {
  const region =
    process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
  return { region };
};

/**
 * .what = acceptance test for cloudwatch outlet journey
 * .why = verifies end-to-end log flow from send to cloudwatch
 */
/**
 * .note = acceptance tests skip when AWS credentials unavailable.
 *         this is not failhide: test skips explicitly with clear reason.
 *         to run locally: rhx keyrack unlock --owner ehmpath --env test
 */
describe('genCloudwatchOutlet.journey', () => {
  const awsCredentialsAvailable = hasAwsCredentials();

  // cleanup helper
  const cleanupLogGroup = async (
    logGroupName: string,
    region: string,
  ): Promise<void> => {
    const client = new CloudWatchLogsClient({ region });
    try {
      await client.send(new DeleteLogGroupCommand({ logGroupName }));
    } catch (error) {
      // allowlist: resource not found is expected for cleanup
      if (
        error instanceof Error &&
        error.name === 'ResourceNotFoundException'
      ) {
        return;
      }
      throw error;
    }
  };

  given.runIf(awsCredentialsAvailable)(
    '[case1] cloudwatch outlet journey',
    () => {
      const logGroupName = `/aws/lambda/simple-log-methods-acceptance-${randomUUID()}`;
      const logStreamName = `acceptance-stream-${randomUUID()}`;
      let testRegion: string;

      afterAll(async () => {
        if (testRegion) await cleanupLogGroup(logGroupName, testRegion);
      });

      when('[t0..t5] full journey executed', () => {
        then('all logs present in order', async () => {
          const { region } = getTestRegion();
          testRegion = region;

          // [t0] outlet created → log group and stream findserted
          const outlet = genCloudwatchOutlet(
            {
              region,
              logGroup: logGroupName,
              logStream: logStreamName,
              flushInterval: 60_000, // long interval to prevent auto-flush interference
            },
            { cloudwatch: { sdk: sdkAwsCloudwatch } },
          );

          // [t1] log messages → buffered
          const messages = [
            'journey log 1',
            'journey log 2',
            'journey log 3',
            'journey log 4',
            'journey log 5',
          ];

          for (const message of messages) {
            const event: LogEvent = {
              level: LogLevel.INFO,
              timestamp: new Date().toISOString(),
              message,
              metadata: { testId: randomUUID() },
            };
            outlet.send(event);
          }

          // [t2] explicit flush (since we can't easily test auto-flush in jest)
          await outlet.flush();

          // [t3] log more → new messages buffered
          const moreMessages = ['journey log 6', 'journey log 7'];

          for (const message of moreMessages) {
            const event: LogEvent = {
              level: LogLevel.INFO,
              timestamp: new Date().toISOString(),
              message,
              metadata: { testId: randomUUID() },
            };
            outlet.send(event);
          }

          // [t4] explicit flush (simulates exit hook behavior)
          await outlet.flush();
          outlet.close?.();

          // wait for cloudwatch to index
          await new Promise((r) => setTimeout(r, 3000));

          // [t5] verify → all logs present in order
          const client = new CloudWatchLogsClient({ region });
          const response = await client.send(
            new GetLogEventsCommand({
              logGroupName,
              logStreamName,
            }),
          );

          expect(response.events).toBeDefined();
          expect(response.events!.length).toBe(7);

          // verify order
          const loggedMessages = response.events!.map((e) => {
            const parsed = JSON.parse(e.message!);
            return parsed.message;
          });

          expect(loggedMessages).toEqual([
            'journey log 1',
            'journey log 2',
            'journey log 3',
            'journey log 4',
            'journey log 5',
            'journey log 6',
            'journey log 7',
          ]);

          // snapshot the structure
          expect(
            response.events!.map((e) => {
              const parsed = JSON.parse(e.message!);
              return {
                level: parsed.level,
                message: parsed.message,
                hasTimestamp: !!parsed.timestamp,
                hasMetadata: !!parsed.metadata,
              };
            }),
          ).toMatchSnapshot();
        });
      });
    },
  );
});
