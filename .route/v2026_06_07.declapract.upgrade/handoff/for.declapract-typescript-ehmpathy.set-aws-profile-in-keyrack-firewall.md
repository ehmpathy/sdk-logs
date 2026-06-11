# handoff: set AWS_PROFILE after OIDC auth for keyrack

## .what

when OIDC AWS auth is used with keyrack, set `AWS_PROFILE=oidc` in a separate step AFTER aws auth but BEFORE tests.

## .why

- OIDC auth sets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
- keyrack.yml declares `AWS_PROFILE` under `env.all` for local development
- keyrack.source() in jest setup checks for `AWS_PROFILE` in strict mode
- `AWS_PROFILE=oidc` satisfies keyrack.source() while strict mode is kept
- aws-actions/configure-aws-credentials fails if AWS_PROFILE is set before it runs

## .pattern

```yaml
# .why = keyrack firewall translates and validates secrets before tests run
#        - filters to declared keys in keyrack.yml
#        - translates mechanisms (e.g., GitHub App → ghs_* token)
#        - blocks dangerous patterns (ghp_*, AKIA*, etc.)
#        - exports to $GITHUB_ENV with mask applied
- name: keyrack firewall
  run: npx rhachet keyrack firewall --env test --from 'json(env://SECRETS_JSON)' --into github.actions
  env:
    SECRETS_JSON: ${{ toJSON(secrets) }}

- name: get aws auth, if creds supplied
  if: ${{ inputs.creds-aws-role-arn }}
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ inputs.creds-aws-role-arn }}
    aws-region: ${{ inputs.creds-aws-region }}

# .why = keyrack declares AWS_PROFILE; oidc sets ACCESS_KEY_ID instead
#        set AWS_PROFILE=oidc AFTER aws auth so keyrack.source() works
- name: set AWS_PROFILE for keyrack
  if: ${{ inputs.creds-aws-role-arn }}
  run: echo "AWS_PROFILE=oidc" >> $GITHUB_ENV
```

## .important: AWS_PROFILE MUST stay in keyrack.yml

AWS_PROFILE is declared in keyrack.yml `env.all` for local development. do not remove it.

## .important: AWS_PROFILE must be set AFTER aws-actions

aws-actions/configure-aws-credentials fails if AWS_PROFILE is already set because it tries to use that profile to assume the role. the "oidc" profile doesn't exist in CI.

order matters:
1. keyrack firewall (AWS_PROFILE absent = ok, firewall notes it but doesn't fail)
2. aws-actions (sets AWS_ACCESS_KEY_ID etc via OIDC)
3. set AWS_PROFILE=oidc (for keyrack.source() at test runtime)
4. tests run

## .key details

- separate step: must be AFTER aws-actions/configure-aws-credentials
- conditional: only run when `inputs.creds-aws-role-arn` is provided
- exports to GITHUB_ENV: available for all subsequent steps
- keyrack.source() at test runtime finds AWS_PROFILE in process.env

## .where to apply

`.github/workflows/.test.yml` in the practice for test-shards-integration and test-shards-acceptance jobs.

## .source

sdk-logs PR: vlad/fix-decycle
