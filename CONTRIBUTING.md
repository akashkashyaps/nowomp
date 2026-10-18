# Contributing to NoWomp

Thanks for wanting to help. This guide covers how to propose changes and what a good pull request looks like.

## Before you start

- **Small fixes** (typos, obvious bugs): open a pull request directly.
- **Anything bigger** (new features, changes to how streaks, excuses or scoring work): open an issue first, so we can agree on the approach before you spend time on it.
- **Security problems:** please don't open a public issue. See [SECURITY.md](SECURITY.md).

## Sign off your commits (DCO)

NoWomp uses the [Developer Certificate of Origin](https://developercertificate.org/) (DCO), the same lightweight process as the Linux kernel. There's nothing to sign: you add a sign-off line to each commit, which certifies that you wrote the change (or have the right to submit it) and that it can be shared under the project's license.

```bash
git commit -s -m "Fix the thing"
```

This adds a line like `Signed-off-by: Your Name <you@example.com>` to the commit message. Forgot it? `git commit --amend -s` fixes the last commit.

Your contribution is licensed under the project's license, the [AGPLv3](LICENSE). You keep the copyright.

## Development setup

See [Build from source](README.md#build-from-source) in the README. In short:

```bash
npm install
npx expo run:android
```

## Pull request checklist

- [ ] Every commit is signed off (`git commit -s`)
- [ ] `npx tsc --noEmit` passes (no type errors)
- [ ] `npx expo lint` passes (no errors or warnings)
- [ ] Tested on a real Android device if the change touches Health Connect, location, notifications, the widget or native code
- [ ] New logic that decides something (verdicts, moods, insights) is a pure function, separate from data loading, so it can be tested without a device
- [ ] No network calls: NoWomp is offline by design
- [ ] User-facing numbers are honest: claims must beat the user's own noise
- [ ] Data changes are additive, with a migration in `database/database.ts`, and covered by backup export and import (`services/ExportService.ts`)

## Code style

- TypeScript throughout; prefer clear names over comments, and comment the *why*, not the *what*.
- Colours and fonts come from `constants/theme.ts`, not hardcoded values.
- Keep screens thin: logic lives in `services/`, definitions and art in `constants/`.
- Match the voice: NoWomp is sarcastic, never cruel, and never jokes about illness or emergencies.

## Commit messages

Short imperative summary (under ~72 characters), then a blank line and the reasoning if it isn't obvious:

```
Fix backup import failing when it contains exercise sessions

The integrity check summed a hand-kept list of tables and missed one,
so every backup with recorded workouts was rejected.
```

## Code of conduct

Be kind and assume good intent. Harassment or personal attacks aren't tolerated in issues, pull requests or discussions, and maintainers may remove content or contributors that break this.
