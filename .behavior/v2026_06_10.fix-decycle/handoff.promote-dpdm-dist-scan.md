# handoff: promote dpdm -T flag pattern

## .what

promote the pattern: use dpdm `-T` flag to ignore type-only imports when you scan for cycles.

## .why

dpdm follows ALL imports — `import type` statements included. this causes false positives:
- type-only imports from devDependencies appear as cycles
- cycles internal to devDependencies (e.g., `@smithy/core`) trigger failures
- no way to distinguish type imports from runtime imports

the `-T` flag transforms typescript to javascript before analysis, which strips type imports.

## .the pattern

### package.json

```json
{
  "scripts": {
    "test:lint:cycles": "dpdm -T --no-warning --no-tree --exit-code circular:1 --exclude \"$(yq -r '.exclude | join(\"|\") // \"^$\"' .dpdmrc.yaml)\" 'src/**/!(*.test).ts'"
  }
}
```

key elements:
1. **-T flag**: transforms TS→JS before analysis, strips type imports
2. **exclude test files**: `'src/**/!(*.test).ts'` glob excludes test files
3. **exclude via config**: `--exclude \"$(yq -r '.exclude | join(\"|\") // \"^$\"' .dpdmrc.yaml)\"`

### .dpdmrc.yaml

```yaml
# dpdm exclude patterns
# each entry is joined with | to form a single regex for --exclude
#
# only exclude devDependencies here
# if you exclude a prod dependency, you ship cycles to consumers and break their builds
exclude: []
```

note: the exclude list should be empty in most cases. exclude of prod dependencies is forbidden (ships cycles to consumers).

## .benefits

1. **no manual excludes needed**: type imports stripped by -T transform
2. **no CI changes needed**: no build step required
3. **no local workflow change**: works on src/ directly
4. **accurate detection**: only runtime cycles flagged

## .comparison to dist/ scan

| aspect | -T flag | dist/ scan |
|--------|---------|------------|
| what it tests | on-the-fly transform | actual compiled output |
| CI changes | none | add build step |
| local workflow | no change | must build first |
| simplicity | one flag | command + CI changes |

the -T flag is simpler and sufficient for cycle detection.

## .migration steps

1. add `-T` flag to dpdm command in test:lint:cycles
2. change glob from `'dist/**/*.js'` to `'src/**/!(*.test).ts'`
3. remove failfast dist/ check if present
4. remove CI build step before lint if added
5. verify with `npm run test:lint:cycles`

## .prior art

discovered while the fix for ehmpathy/sdk-logs#vlad/fix-decycle branch. the `@aws-sdk/client-cloudwatch-logs` devDependency has internal cycles in `@smithy/core` and `@aws-crypto/crc32` which triggered false positives.
