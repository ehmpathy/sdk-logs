# handoff: set AWS_PROFILE in keyrack firewall env block for OIDC auth

## .what

when OIDC AWS auth is used with keyrack, set `AWS_PROFILE` in the keyrack firewall step's env block. keyrack reads from env vars.

## .why

- OIDC auth sets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
- keyrack.yml declares `AWS_PROFILE` under `env.all` for local development
- keyrack.source() in jest setup checks for `AWS_PROFILE` in strict mode
- `AWS_PROFILE=oidc` satisfies keyrack.source() while strict mode is kept
- keyrack reads from env vars (not only SECRETS_JSON)
- keyrack firewall's `--into github.actions` exports to GITHUB_ENV for subsequent steps

## .pattern

```yaml
# .why = keyrack firewall translates and validates secrets before tests run
#        - filters to declared keys in keyrack.yml
#        - translates mechanisms (e.g., GitHub App → ghs_* token)
#        - blocks dangerous patterns (ghp_*, AKIA*, etc.)
#        - exports to $GITHUB_ENV with mask applied
#        - AWS_PROFILE set here for OIDC auth (keyrack reads from envvar)
- name: keyrack firewall
  run: npx rhachet keyrack firewall --env test --from 'json(env://SECRETS_JSON)' --into github.actions
  env:
    SECRETS_JSON: ${{ toJSON(secrets) }}
    AWS_PROFILE: ${{ inputs.creds-aws-role-arn && 'oidc' || '' }}

- name: get aws auth, if creds supplied
  if: ${{ inputs.creds-aws-role-arn }}
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ inputs.creds-aws-role-arn }}
    aws-region: ${{ inputs.creds-aws-region }}
```

## .important: AWS_PROFILE MUST stay in keyrack.yml

AWS_PROFILE is declared in keyrack.yml `env.all` for local development. to remove it breaks local tests.

keyrack firewall reads keys from BOTH:
- `SECRETS_JSON` (for actual secrets)
- env vars (for non-secrets like AWS_PROFILE)

## .key details

- AWS_PROFILE in keyrack firewall env block: keyrack reads from envvar
- conditional value: `'oidc'` when creds provided, `''` otherwise
- empty string when creds not provided: keyrack marks as absent, tests failfast (expected)
- `--into github.actions`: exports keys to GITHUB_ENV for subsequent steps
- keyrack.source() at test runtime finds AWS_PROFILE in process.env

## .failfast behavior

if creds-aws-role-arn is not configured and keyrack.yml declares AWS_PROFILE, tests should failfast. this is expected — repos that need AWS auth should configure the credential.

## .where to apply

`.github/workflows/.test.yml` in the practice for test-shards-integration and test-shards-acceptance jobs.

## .source

sdk-logs PR: vlad/fix-decycle
