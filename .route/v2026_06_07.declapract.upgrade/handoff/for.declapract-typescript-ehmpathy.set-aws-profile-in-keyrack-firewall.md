# handoff: set AWS_PROFILE in keyrack firewall env block for OIDC auth

## .what

when OIDC AWS auth is used with keyrack, run aws-actions BEFORE keyrack firewall, then set `AWS_PROFILE` in the keyrack firewall env block.

## .why

- OIDC auth sets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` — NOT `AWS_PROFILE`
- keyrack.yml declares `AWS_PROFILE` under `env.all` for local development
- keyrack.source() in jest setup checks for `AWS_PROFILE` in strict mode
- aws-actions fails if AWS_PROFILE is set before it runs (tries to use non-existent profile)
- keyrack reads from env vars, so we set AWS_PROFILE in the keyrack firewall env block

## .pattern

```yaml
# .why = keyrack.yml can extend other manifests via symlinks
- name: prepare:rhachet
  run: npm run prepare:rhachet --if-present

# aws auth FIRST - before keyrack firewall
- name: get aws auth, if creds supplied
  if: ${{ inputs.creds-aws-role-arn }}
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ inputs.creds-aws-role-arn }}
    aws-region: ${{ inputs.creds-aws-region }}

# keyrack firewall AFTER aws auth - set AWS_PROFILE in env block
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
```

## .important: AWS_PROFILE MUST stay in keyrack.yml

AWS_PROFILE is declared in keyrack.yml `env.all` for local development. do not remove it.

## .key details

- aws-actions runs FIRST (sets ACCESS_KEY_ID, no AWS_PROFILE interference)
- keyrack firewall runs AFTER (with AWS_PROFILE=oidc in env block)
- keyrack reads from env vars and exports to GITHUB_ENV via `--into github.actions`
- keyrack.source() at test runtime finds AWS_PROFILE in process.env

## .where to apply

`.github/workflows/.test.yml` in the practice for test-shards-integration and test-shards-acceptance jobs.

## .source

sdk-logs PR: vlad/fix-decycle
