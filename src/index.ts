export { LogLevel } from './domain.objects/constants';
export type { LogEvent, LogOutlet } from './domain.objects/LogOutlet';
export type {
  ContextLogTrail,
  HasContextLogTrail,
  LogTrail,
} from './domain.objects/LogTrail';
export { genContextLogTrail } from './domain.operations/genContextLogTrail';
export type { LogMethod } from './domain.operations/generateLogMethod';
export type { LogMethods } from './domain.operations/genLogMethods';
export { genLogMethods } from './domain.operations/genLogMethods';
export { asDefaultLogStreamName } from './domain.operations/outlets/cloudwatch/asDefaultLogStreamName';
export { asLambdaStyleLogGroupName } from './domain.operations/outlets/cloudwatch/asLambdaStyleLogGroupName';
export {
  genCloudwatchOutlet,
  type SdkAwsCloudwatch,
} from './domain.operations/outlets/cloudwatch/genCloudwatchOutlet';
export { withLogTrail } from './domain.operations/withLogTrail';
