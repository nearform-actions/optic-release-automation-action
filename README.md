<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [optic-release-automation-action](#optic-release-automation-action)
  - [Documentation](#documentation)
  - [Playground / Testing](#playground--testing)
  - [Publishing modes](#publishing-modes)
    - [OIDC (Trusted Publishing)](#oidc-trusted-publishing)
    - [Token mode (classic)](#token-mode-classic)
    - [Orchestration only](#orchestration-only)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

[![ci](https://github.com/nearform-actions/optic-release-automation-action/actions/workflows/ci.yml/badge.svg)](https://github.com/nearform-actions/optic-release-automation-action/actions/workflows/ci.yml)

# optic-release-automation-action

This action allows you to automate the release process of your npm modules, apps and actions. It can fetch OTP for Npm on the fly using [Optic](https://github.com/nearform/optic-expo).

## Documentation

The Optic documentation is available [on the website](https://optic.nearform.com/)

To get started, visit the [Getting Started](https://optic.nearform.com/getting-started) page for a brief overview.

## Playground / Testing

Please look at the [playground reposity](https://github.com/nearform/optic-release-automation-playground) for more information (only accessible by users in the NearForm org).

[![banner](https://raw.githubusercontent.com/nearform/.github/refs/heads/master/assets/os-banner-green.svg)](https://www.nearform.com/contact/?utm_source=open-source&utm_medium=banner&utm_campaign=os-project-pages)

## Publishing modes

This action supports three publishing modes via the `publish-mode` input:

- **token (default)**: Uses classic npm token auth. Supports MFA via Optic/ngrok OTP. Requires `npm-token` and optionally `optic-token` or `ngrok-token`.
- **oidc**: Uses npm Trusted Publishing with OIDC; no npm token or OTP needed. Requires workflow OIDC permissions and package Trusted Publisher configuration on npm.
- **none**: Skips `npm publish` entirely and only performs the orchestration (bump/PR/release/tags).

### OIDC (Trusted Publishing)

Requirements (must be configured in your workflow/repo):

- **npm CLI**: v11.5.1 or later.
- **Workflow permissions**: `permissions: id-token: write` for the job that publishes.
- **Trusted Publisher on npm**: Configure your package on npmjs.com to trust your specific GitHub workflow (org/repo/workflow/environment).
- **Provenance**: npm automatically generates provenance in trusted publishing; you do not need to pass `--provenance` or set `provenance: true`.

Reference: npm Trusted Publishing GA announcement [link](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/).

Example workflow snippet (OIDC):

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v5
      - uses: nearform-actions/optic-release-automation-action@v4
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          semver: patch
          publish-mode: oidc
```

Notes:

- Do not set `npm-token`, `optic-token`, or `ngrok-token` when using OIDC.
- `access` (e.g. `public`/`restricted`) is still honored and passed to `npm publish`.
- If you set `provenance: true` with OIDC, the action will not add `--provenance` because npm handles it automatically.

### Token mode (classic)

Example workflow snippet (token):

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: nearform-actions/optic-release-automation-action@v4
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          semver: patch
          publish-mode: token
          npm-token: ${{ secrets.NPM_TOKEN }}
          # Optional for MFA flows
          optic-token: ${{ secrets.OPTIC_TOKEN }}
          ngrok-token: ${{ secrets.NGROK_TOKEN }}
          # Optional
          provenance: false
```

### Orchestration only

If you want Optic to open the PR / draft release but publish in a separate step:

```yaml
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v5
      - uses: nearform-actions/optic-release-automation-action@v4
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          semver: patch
          publish-mode: none
      - run: npm publish --tag latest
```

Backward compatibility: if `publish-mode` is omitted, the action behaves as before (token mode).
