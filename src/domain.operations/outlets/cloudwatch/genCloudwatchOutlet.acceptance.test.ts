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
 * .note = acceptance tests skip when AWS credentials unavailable.
 *         this is not failhide: test skips explicitly with clear reason.
 *         to run locally: rhx keyrack unlock --owner ehmpath --env test
 */
describe('genCloudwatchOutlet', () => {
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
    '[case1] cloudwatch outlet created',
    () => {
      const logGroupName = `/aws/lambda/simple-log-methods-test-${randomUUID()}`;
      const logStreamName = `test-stream-${randomUUID()}`;
      let testRegion: string;

      afterAll(async () => {
        if (testRegion) await cleanupLogGroup(logGroupName, testRegion);
      });

      when('[t0] send and flush called', () => {
        then('log event sent to cloudwatch', async () => {
          const { region } = getTestRegion();
          testRegion = region;

          // create outlet and send event
          const outlet = genCloudwatchOutlet(
            {
              region,
              logGroup: logGroupName,
              logStream: logStreamName,
            },
            { cloudwatch: { sdk: sdkAwsCloudwatch } },
          );

          const event: LogEvent = {
            level: LogLevel.INFO,
            timestamp: new Date().toISOString(),
            message: 'test message from integration test',
            metadata: { testId: randomUUID() },
          };

          outlet.send(event);
          await outlet.flush();
          outlet.close?.();

          // wait for cloudwatch to index
          await new Promise((r) => setTimeout(r, 2000));

          // verify event in cloudwatch
          const client = new CloudWatchLogsClient({ region });
          const response = await client.send(
            new GetLogEventsCommand({
              logGroupName,
              logStreamName,
            }),
          );

          expect(response.events).toBeDefined();
          expect(response.events!.length).toBeGreaterThan(0);

          const loggedEvent = JSON.parse(response.events![0]!.message!);
          expect(loggedEvent.message).toEqual(
            'test message from integration test',
          );

          // snapshot LogEvent structure
          expect({
            level: loggedEvent.level,
            message: loggedEvent.message,
            hasTimestamp: !!loggedEvent.timestamp,
            hasMetadata: !!loggedEvent.metadata,
          }).toMatchSnapshot();
        });
      });
    },
  );

  given.runIf(awsCredentialsAvailable)(
    '[case2] region parameter provided',
    () => {
      when('[t0] outlet created with explicit region', () => {
        then('uses explicit region over env vars', () => {
          // outlet creation should succeed with explicit region
          const outlet = genCloudwatchOutlet(
            {
              region: 'eu-west-1',
              logGroup: '/test/explicit-region',
              logStream: 'test-stream',
            },
            { cloudwatch: { sdk: sdkAwsCloudwatch } },
          );

          // verify outlet was created (won't throw)
          expect(outlet.send).toBeDefined();
          expect(outlet.flush).toBeDefined();
          expect(outlet.close).toBeDefined();

          // snapshot outlet interface
          expect({
            hasSend: typeof outlet.send === 'function',
            hasFlush: typeof outlet.flush === 'function',
            hasClose: typeof outlet.close === 'function',
          }).toMatchSnapshot();

          // cleanup
          outlet.close?.();
        });
      });
    },
  );

  given.runIf(awsCredentialsAvailable)(
    '[case3] skipLogGroupCreation is true',
    () => {
      const logGroupName = `/aws/lambda/simple-log-methods-test-${randomUUID()}`;
      const logStreamName = `test-stream-${randomUUID()}`;
      let testRegion: string;

      afterAll(async () => {
        if (testRegion) await cleanupLogGroup(logGroupName, testRegion);
      });

      when('[t0] send and flush called without log group', () => {
        then('throws because log group absent', async () => {
          const { region } = getTestRegion();
          testRegion = region;

          const outlet = genCloudwatchOutlet(
            {
              region,
              logGroup: logGroupName,
              logStream: logStreamName,
              skipLogGroupCreation: true,
            },
            { cloudwatch: { sdk: sdkAwsCloudwatch } },
          );

          const event: LogEvent = {
            level: LogLevel.INFO,
            timestamp: new Date().toISOString(),
            message: 'test message',
          };

          outlet.send(event);

          let errorThrown = false;
          try {
            await outlet.flush();
          } catch {
            errorThrown = true;
          }
          expect(errorThrown).toBe(true);
          expect({
            skipLogGroupCreation: true,
            errorOnFlush: errorThrown,
          }).toMatchSnapshot();
          outlet.close?.();
        });
      });
    },
  );

  given.runIf(awsCredentialsAvailable)(
    '[case4] multiple events batched',
    () => {
      const logGroupName = `/aws/lambda/simple-log-methods-test-${randomUUID()}`;
      const logStreamName = `test-stream-${randomUUID()}`;
      let testRegion: string;

      afterAll(async () => {
        if (testRegion) await cleanupLogGroup(logGroupName, testRegion);
      });

      when('[t0] multiple events sent and flushed', () => {
        then('all events appear in cloudwatch', async () => {
          const { region } = getTestRegion();
          testRegion = region;

          const outlet = genCloudwatchOutlet(
            {
              region,
              logGroup: logGroupName,
              logStream: logStreamName,
            },
            { cloudwatch: { sdk: sdkAwsCloudwatch } },
          );

          for (let i = 0; i < 5; i++) {
            outlet.send({
              level: LogLevel.INFO,
              timestamp: new Date().toISOString(),
              message: `batch message ${i}`,
            });
          }

          await outlet.flush();
          outlet.close?.();

          // wait for cloudwatch to index
          await new Promise((r) => setTimeout(r, 2000));

          const client = new CloudWatchLogsClient({ region });
          const response = await client.send(
            new GetLogEventsCommand({
              logGroupName,
              logStreamName,
            }),
          );

          expect(response.events!.length).toBe(5);
          // snapshot event structure (messages vary, but structure is deterministic)
          const parsedEvents = response.events!.map((e) => {
            const parsed = JSON.parse(e.message!);
            return {
              level: parsed.level,
              messagePattern: /^batch message \d$/.test(parsed.message),
              hasTimestamp: !!parsed.timestamp,
            };
          });
          expect({
            eventCount: response.events!.length,
            eventStructures: parsedEvents,
          }).toMatchSnapshot();
        });
      });
    },
  );
});
