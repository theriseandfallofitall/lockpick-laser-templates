# lockpick-laser-templates

Own parametric pick and tension-tool designs. Regenerate with the commands in README.md; run `tools/check_laser_files.py` after any change.

## Repo layout (keep it organised)

Checked by `.githooks/layout_check.py` (settings in `.layout.json`), run by `.githooks/pre-commit` on
every commit (turn on once per clone: `git config core.hooksPath .githooks`). A failure is fixed by
moving or documenting the file, never by loosening the check or committing with `--no-verify`
without the owner's say-so.

- **Root** holds only the files in `.layout.json` `rootFiles`: viewer pages, release notes, manifests (the viewer and build scripts read them from the root) and requirements. Everything else goes in a folder.
- **Folders:** each has one job, written in README, Repo map. A new top-level folder only when none
  fits, added to the map in the same commit. New fabrication families go in `generated/<family>/` with a README.
- **Docs:** `README.md` stays an overview, a Repo map and a Docs index; detail goes in `docs/`,
  one doc per area, each with a row in README, Docs. Doc names lower-case kebab.
  Research goes in docs/research/, finished trackers and task lists in docs/archive/ (create them when first needed). Write about a
  topic in the doc that owns it; link, do not repeat.
- **Scripts:** generators and packagers in `build/`, repo checks in `tools/`, each with a row in `docs/code.md`. New scripts are repo-relative (no absolute ROOT).
- **Generated output:** fabrication files, previews and ZIPs are the product and are tracked. Caches and scratch never go in git; temp files go outside the repo.
- **Moving things:** allowed when it makes the layout clearer. In the same commit: update every
  mention (`git grep` the old path; the check fails on a backticked path that no longer exists) and
  add old → new rows to `docs/moves.md`.
- **Keep stable across moves:** viewer URLs (`INDEX.html`, `?family=` links), manifest paths, file paths inside manifests and ZIPs, and the `generated/` family folders. Move a file only with a redirect or a manifest update, plus a `docs/moves.md` row.
