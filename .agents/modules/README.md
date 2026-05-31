# modules/ — Lead Protocol opt-in modules

Modules are opt-in extensions to `PROTOCOL_RULES.md` (the kernel). Activation is declared in `PROJECT_RULES.md §J8 Active modules`. Each module is versioned independently from the kernel and from other modules. The contract for modules is defined in `PROTOCOL_RULES.md §P9`.

Available in this template:

| Module | Scope | Activate when |
|---|---|---|
| `git-substrate.md` | Branching, pull-request workflow, README-sync CI, `.gitignore` baseline | Repo is hosted on a git platform with pull-request support (GitHub, GitLab, Bitbucket). |
| `meta-repo.md` | IDE-vs-template duality, pristine state files, promotion lifecycle | Repo itself develops the Lead Protocol (has both a root `.agents/` and a `template/`). Rarely needed in consumer repos. |

To activate, add the module's scope name to `PROJECT_RULES.md §J8 Active modules`. To deactivate, remove it from the list — the file can stay on disk.
