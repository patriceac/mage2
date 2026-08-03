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

## Desktop trust boundary

- The packaged editor loads only its `mage2-app://bundle/` renderer and serves project media through opaque `mage2-file://` capabilities.
- Every privileged IPC message must come from the current editor window's exact main frame and trusted URL.
- Renderer navigation, child windows, webviews, downloads, device access, display capture, and permission requests are denied by default.
- Filesystem browsing is limited to favorite folders, valid recent or launch projects, explicit drag-and-drop selections, and folders granted through the native picker. Project mutations and media URLs remain confined to the granted project root.
- Production renderer scripts use a restrictive CSP. Development-only HMR relaxations must never appear in a packaged build.

Run `npm run audit:release` before packaging. See [docs/RELEASING.md](docs/RELEASING.md) for signing and checksum requirements.
