# Security

Report suspected credential, privacy, or filesystem-safety issues privately to the repository owner. Do not place sensitive evidence in a public issue, pull request, build log, or test fixture.

## Repository hygiene

- Keep browser profiles, cookies, login databases, personal documents, and generated scratch folders outside the repository.
- Run `npm run check:sensitive-paths` before committing. CI runs the same deny check against the Git index.
- Review the staged diff explicitly. Avoid broad staging commands when working near generated or personal files.
- After any history rewrite for sensitive-data removal, discard old clones or carefully rebase them. Never merge an old branch back into sanitized history.

## Filesystem boundaries

Treat project creation and runtime export as destructive filesystem boundaries. Resolve and validate destinations before writing. Never replace a nonempty folder unless it is positively identified as MAGE2-managed output, and never target project, application, filesystem, or ancestor roots.

Runtime builds must be created in a separate staging folder, validated there, and promoted only after staging succeeds. A failed export must preserve the previous build. Native close requests must wait for a successful save or an explicit **Discard Changes** action.
