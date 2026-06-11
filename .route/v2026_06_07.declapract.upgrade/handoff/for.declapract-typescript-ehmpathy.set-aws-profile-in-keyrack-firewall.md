# handoff: set AWS_PROFILE in keyrack firewall step

## .what

when OIDC AWS auth is used with keyrack, set `AWS_PROFILE=oidc` in the keyrack firewall step's env block.

## .why

- OIDC auth sets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
- keyrack.yml declares `AWS_PROFILE` for local development
- keyrack strict mode fails if declared keys are absent
- set `AWS_PROFILE=oidc` to satisfy keyrack while strict mode is kept

## .pattern

```yaml
# .why = keyrack firewall translates and validates secrets before tests run
#        - filters to declared keys in keyrack.yml
#        - translates mechanisms (e.g., GitHub App → ghs_* token)
#        - blocks dangerous patterns (ghp_*, AKIA*, etc.)
#        - exports to $GITHUB_ENV with mask applied
#        - sets AWS_PROFILE=oidc when oidc auth is used (keyrack declares AWS_PROFILE for local dev)
- name: keyrack firewall
  run: npx rhachet keyrack firewall --env test --from 'json(env://SECRETS_JSON)' --into github.actions
  env:
    SECRETS_JSON: ${{ toJSON(secrets) }}
    AWS_PROFILE: ${{ inputs.creds-aws-role-arn && 'oidc' || '' }}
```

## .key details

- conditional: only set if `inputs.creds-aws-role-arn` is provided
- empty string fallback: `&& 'oidc' || ''` ensures no value when aws creds not used
- location: in the keyrack firewall step's env block (not a separate step)
- keeps strict mode: no need for lenient mode workaround

## .alternative considered (rejected)

add a separate step after aws auth to set AWS_PROFILE via GITHUB_ENV — rejected because:
- more steps = more complexity
- keyrack firewall already exports to GITHUB_ENV
- cleaner to set in same env block that keyrack reads

## .where to apply

`.github/workflows/.test.yml` in the practice for test-shards-integration and test-shards-acceptance jobs.

## .source

sdk-logs PR: vlad/fix-decycle
