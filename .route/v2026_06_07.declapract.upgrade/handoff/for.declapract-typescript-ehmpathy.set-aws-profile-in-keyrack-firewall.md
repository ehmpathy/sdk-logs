# handoff: set AWS_PROFILE after OIDC auth for keyrack

## .what

when OIDC AWS auth is used with keyrack, set `AWS_PROFILE=oidc` in a separate step AFTER aws auth but BEFORE tests.

## .why

- OIDC auth sets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
- keyrack.source() in jest setup checks for `AWS_PROFILE` in strict mode
- `AWS_PROFILE=oidc` satisfies keyrack.source() while strict mode is kept

## .pattern

```yaml
- name: get aws auth, if creds supplied
  if: ${{ inputs.creds-aws-role-arn }}
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ inputs.creds-aws-role-arn }}
    aws-region: ${{ inputs.creds-aws-region }}

# .why = keyrack declares AWS_PROFILE; oidc sets ACCESS_KEY_ID instead
#        set AWS_PROFILE=oidc so keyrack strict mode is satisfied
- name: set AWS_PROFILE for keyrack
  if: ${{ inputs.creds-aws-role-arn }}
  run: echo "AWS_PROFILE=oidc" >> $GITHUB_ENV
```

## .important: do NOT declare AWS_PROFILE in keyrack.yml

keyrack firewall validates that all declared keys exist in `SECRETS_JSON`. `AWS_PROFILE` is not a secret — it's set by us based on auth method. If declared in keyrack.yml, firewall will fail.

repos that use OIDC for AWS auth should NOT include `AWS_PROFILE` in their keyrack.yml `env.all` section.

## .key details

- separate step: must be after aws-actions/configure-aws-credentials
- conditional: only run when `inputs.creds-aws-role-arn` is provided
- exports to GITHUB_ENV: available for all subsequent steps
- keyrack.source() reads from process.env at test runtime

## .alternative considered (rejected)

set AWS_PROFILE in keyrack firewall step's env block — rejected because:
- keyrack firewall validates secrets from `SECRETS_JSON`, not env vars
- env block vars don't satisfy keyrack firewall validation
- causes "blocked: no value to validate" error

## .where to apply

`.github/workflows/.test.yml` in the practice for test-shards-integration and test-shards-acceptance jobs.

## .source

sdk-logs PR: vlad/fix-decycle
