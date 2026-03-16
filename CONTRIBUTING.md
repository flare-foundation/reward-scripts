# Contributing

This document describes the process of contributing to this project. It is
intended for anyone considering opening an issue or pull request.

## AI Assistance

> [!IMPORTANT]
> If you are using any kind of AI assistance to contribute to this project,
> it must be disclosed in the pull request.

If you are using any kind of AI assistance while contributing to this project,
this must be disclosed in the pull request, along with the extent to which
AI assistance was used. Trivial tab-completion doesn't need to be disclosed, as
long as it is limited to single keywords or short phrases.

An example disclosure:

> This PR was written primarily by Claude Code.

Or a more detailed disclosure:

> I consulted ChatGPT to understand the codebase but the solution was fully
> authored manually by myself.

## Quick start

If you'd like to contribute, report a bug, suggest a feature or you've
implemented a feature you should open an issue or pull request.

Any contribution to the project is expected to contain code that is formatted,
linted and that the existing tests still pass. Adding unit tests for new code is
also welcome.

## Dev environment

- [Node.js](https://nodejs.org/) >= 24.0.0
- [pnpm](https://pnpm.io/)

```bash
git clone https://github.com/flare-foundation/reward-scripts.git
cd reward-scripts
pnpm install
```

To compile TypeScript:

```bash
pnpm build
```

## Linting and formatting

This project uses [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/)
with the [Flare shared configurations](https://github.com/flare-foundation/flare-handbook).

Lint all source files:

```bash
pnpm lint:check
```

Lint and auto-fix:

```bash
pnpm lint:fix
```

Check formatting:

```bash
pnpm format:check
```

Format all source files:

```bash
pnpm format:fix
```

## Testing

Run the test suite:

```bash
pnpm test
```

Run with coverage report:

```bash
pnpm test:coverage
```

## Release process

The reward calculation outputs are committed directly to the repository on a
per-epoch basis. There is no package release process.
