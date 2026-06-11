import { BadRequestError } from 'helpful-errors';

/**
 * .what = validates AWS credentials are available via common sources
 * .why = fail-fast at outlet creation rather than on first flush
 *
 * .note = checks env vars and shared credentials file.
 *         async credential providers (SSO, IAM roles) are validated on first flush.
 */
export const assertAwsCredentialsPresent = (): void => {
  // check env var credentials (most common in non-Lambda environments)
  const hasEnvCredentials =
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

  // check if profile is specified (indicates shared credentials or SSO)
  const hasProfile = process.env.AWS_PROFILE;

  // check if role ARN is specified (indicates assume-role config)
  const hasRoleArn = process.env.AWS_ROLE_ARN;

  // check if web identity is configured (EKS/IRSA)
  const hasWebIdentity =
    process.env.AWS_WEB_IDENTITY_TOKEN_FILE && process.env.AWS_ROLE_ARN;

  // check if container credentials are configured (ECS/Fargate)
  const hasContainerCredentials =
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;

  // check if in EC2/Lambda (metadata service provides credentials)
  const hasMetadataService = process.env.AWS_EXECUTION_ENV;

  // if none of the common credential sources are present, fail fast
  if (
    !hasEnvCredentials &&
    !hasProfile &&
    !hasRoleArn &&
    !hasWebIdentity &&
    !hasContainerCredentials &&
    !hasMetadataService
  ) {
    throw new BadRequestError(
      'AWS credentials not configured. genCloudwatchOutlet requires valid AWS credentials.',
      {
        hint: [
          'configure credentials via one of:',
          '  - env: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY',
          '  - env: AWS_PROFILE (for shared credentials or SSO)',
          '  - env: AWS_WEB_IDENTITY_TOKEN_FILE + AWS_ROLE_ARN (for EKS/IRSA)',
          '  - container: execute in ECS/Fargate with task role',
          '  - metadata: execute in EC2/Lambda with instance/execution role',
        ].join('\n'),
      },
    );
  }
};
