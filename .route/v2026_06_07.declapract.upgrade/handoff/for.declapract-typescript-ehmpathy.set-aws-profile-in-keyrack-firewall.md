# handoff: skip keyrack.source() when OIDC credentials present

## .what

when OIDC AWS auth is used, skip keyrack.source() if AWS_ACCESS_KEY_ID is already set.

## .why

- OIDC auth sets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
- if `AWS_PROFILE` is also set, AWS SDK prefers profile lookup over ACCESS_KEY_ID
- AWS SDK then fails because the profile doesn't exist
- solution: don't set AWS_PROFILE in CI, skip keyrack.source() when OIDC credentials present

## .pattern

### jest.acceptance.env.ts

```ts
/**
 * .what = source credentials from keyrack for test env
 * .why =
 *   - auto-inject keys into process.env
 *   - fail fast with helpful error if keyrack locked or keys absent
 *   - skip when OIDC credentials present (AWS_ACCESS_KEY_ID set by aws-actions in CI)
 */
const keyrackYmlPath = join(process.cwd(), '.agent/keyrack.yml');
if (existsSync(keyrackYmlPath) && !process.env.AWS_ACCESS_KEY_ID)
  keyrack.source({ env: 'test', owner: 'ehmpath', mode: 'strict' });
```

### .github/workflows/.test.yml

```yaml
# .why = keyrack.yml can extend other manifests via symlinks
- name: prepare:rhachet
  run: npm run prepare:rhachet --if-present

# aws auth - sets ACCESS_KEY_ID, SECRET_ACCESS_KEY, SESSION_TOKEN
- name: get aws auth, if creds supplied
  if: ${{ inputs.creds-aws-role-arn }}
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ inputs.creds-aws-role-arn }}
    aws-region: ${{ inputs.creds-aws-region }}

# keyrack firewall - do NOT set AWS_PROFILE
# .why = keyrack firewall translates and validates secrets before tests run
#        - filters to declared keys in keyrack.yml
#        - translates mechanisms (e.g., GitHub App → ghs_* token)
#        - blocks dangerous patterns (ghp_*, AKIA*, etc.)
#        - exports to $GITHUB_ENV with mask applied
- name: keyrack firewall
  run: npx rhachet keyrack firewall --env test --from 'json(env://SECRETS_JSON)' --into github.actions
  env:
    SECRETS_JSON: ${{ toJSON(secrets) }}
```

## .important: AWS_PROFILE MUST stay in keyrack.yml

AWS_PROFILE is declared in keyrack.yml `env.all` for local development. do not remove it.

## .key details

- aws-actions sets ACCESS_KEY_ID, SECRET_ACCESS_KEY, SESSION_TOKEN
- do NOT set AWS_PROFILE in CI (causes SDK conflict)
- jest.acceptance.env.ts skips keyrack.source() when AWS_ACCESS_KEY_ID present
- local dev: keyrack.source() runs, pulls AWS_PROFILE from keyrack
- CI: keyrack.source() skipped, OIDC credentials already in env

## .where to apply

1. `jest.acceptance.env.ts` — add `&& !process.env.AWS_ACCESS_KEY_ID` condition
2. `.github/workflows/.test.yml` — ensure no AWS_PROFILE is set in keyrack env block

## .source

sdk-logs PR: vlad/fix-decycle
