[![ci](https://github.com/nearform/optic-release-automation-action/actions/workflows/ci.yml/badge.svg)](https://github.com/nearform/optic-release-automation-action/actions/workflows/ci.yml)

# optic-release-automation-action

This action allows you to automate the release process of your npm modules, apps and actions. It can fetch OTP for Npm on the fly using [Optic](https://github.com/nearform/optic-expo).

## What does it do?

- When run, it opens a new PR for the release.
- When/if the PR gets merged, it publishes a new Npm release, a new GitHub release with change logs and it adds a comment for each issues linked to the release with links to the release deatils. This feature can be turned off by the `notify-linked-issues` flag.

You can also use it for releases without Npm. In that case, when the PR merges, a new GitHub release will be published. Which you can use to trigger another workflow that deploys the app somewhere (GCP, AWS etc).

## Usage

- Install the [optic-release-automation](https://github.com/apps/optic-release-automation) GitHub app to your organization (or selected repositories)
- Create a new workflow file at `.github/workflows/release.yml` (from example below) with one step that uses this action and supply the inputs.

Note that the `on` triggers are mandatory:

- `workflow_dispatch`: to start the new release process
- `pull_request` when `closed`: to complete the release process when the PR is merged

## Example

This example shows how to configure this action to release a new Npm package version:

```yml
name: release

on:
  workflow_dispatch:
    inputs:
      semver:
        description: "The semver to use"
        required: true
        default: "patch"
        type: choice
        options:
          - auto
          - patch
          - minor
          - major
          - prerelease
          - prepatch
          - preminor
          - premajor
      baseTag:
        description: "base release tag"
      tag:
        description: "The npm tag"
        required: false
        default: "latest"
      commit-message:
        description: "The commit message template"
        required: false
        default: "Release {version}"
  pull_request:
    types: [closed]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: nearform/optic-release-automation-action@v4
        with:
          npm-token: ${{ secrets.NPM_TOKEN }}
          optic-token: ${{ secrets.OPTIC_TOKEN }}
          commit-message: ${{ github.event.inputs.commit-message }}
          semver: ${{ github.event.inputs.semver }}
          npm-tag: ${{ github.event.inputs.tag }}
```

The above workflow (when manually triggered) will:

- Checkout the repository source code
- Run `npm version <semver>` command to bump the version as configured (patch, minor, etc)
- Execute the `build-command` if configured
- Commit the changes and push to the `release/${new semver version}` branch
- Open a PR that looks like following

![image](https://user-images.githubusercontent.com/2510597/140506212-4938e44d-0662-4dc5-9fb1-c3f59fe075a6.png)

When you merge this PR:

- It will request an Npm OTP from Optic.
- _(Optional)_ You can define Npm and Optic tokens in GitHub secrets for each user that will receive the OTP. This is required only in case you want to publish to Npm.
- Upon successful retrieval of the OTP, it will publish the package to Npm.
- Create a Github release with change logs (You can customize release notes using [release.yml](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes#example-configuration))
- Leave a comment on each issues that are linked to the pull reqeuests of this release. This feature can be turned off by the `notify-on-the-issue` flag.

When you close the PR without merging it: nothing will happen.

## Using 'auto' bump version option
If you choose the "auto" option for semver version updates, the action will attempt to determine the new version number based on the commit messages. For this option to work, the repository must use the conventional commits standard. You can refer the [conventional commits documention](https://www.conventionalcommits.org/en/v1.0.0/)
for more information.

## Using branches filter

In case you want to reduce the amount of the relase workflow runs, you can configure a workflow to run only for pull requests that target specific branches.
Example:

```yml
name: release

on:
  ...
  pull_request:
    types: [closed]
    branches:
      - master
      - 'release/**'
```

## Multiple user scenario

In case there are multiple users who have access to trigger the release automation action, you can define Npm and Optic tokens for different users in GitHub secrets.
Following is an example of a way to use different tokens depending on the user who merged the pull request.

### Example

- Use only default tokens:
  *e.g.* `npm-token: ${{ secrets.NPM_TOKEN }}`
- Use only user-related tokens:
  *e.g.* `npm-token: ${{ secrets[format('NPM_TOKEN_{0}', github.actor)] }}`
- Use both user-related and default token:
  *e.g.* `npm-token: ${{ secrets[format('NPM_TOKEN_{0}', github.actor)] || secrets.NPM_TOKEN }}`

```yml
# ...
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: nearform/optic-release-automation-action@v4
        with:
          npm-token: ${{ secrets[format('NPM_TOKEN_{0}', github.actor)] || secrets.NPM_TOKEN }}
          optic-token: ${{ secrets[format('OPTIC_TOKEN_{0}', github.actor)] || secrets.OPTIC_TOKEN }}
          semver: ${{ github.event.inputs.semver }}
          npm-tag: ${{ github.event.inputs.tag }}
```

> Not all symbols that can be used in GitHub usernames are valid in secret names. One such example is the hyphen symbol (`-`). In such cases, this approach will not work.

## How to add a build step to your workflow

When your project needs a build step, you can provide it to this action!
The `build-command` option accepts a string that will be executed as a shell command (you can use `yarn` or your preferred build tool).

It is important to be aware that you are responsible for:

1. The context where the command is executed. <br /> The command will be executed using the current [GitHub runner](https://github.com/actions/runner#github-actions-runner) configuration (e.g. the one set on `runs-on`).
You can customize it by executing additional steps before the `nearform/optic-release-automation-action` step execution as shown in the next example.
2. The command to build the project, starting from the installation to the cleanup if needed.<br /> You can set any automations like [git hooks](https://git-scm.com/book/it/v2/Customizing-Git-Git-Hooks) or [`pre/post` scripts](https://docs.npmjs.com/cli/v8/using-npm/scripts#pre--post-scripts) to execute within the `build-command` step.

The build's output will be committed to the `release/${new semver version}` branch, unless the project's `.gitignore` blocks it.
In that case, the build's output will be packed into the Npm package during the release process.

Here an example using `npm` to build the project:

```yml
# ...
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Optionally configure your preferred runtime
        uses: actions/setup-node@v3
        with:
          node-version: 14 # setting a specific version of node as an example

      - uses: nearform/optic-release-automation-action@v4
        with:
          npm-token: ${{ secrets.NPM_TOKEN }}
          optic-token: ${{ secrets.OPTIC_TOKEN }}
          semver: ${{ github.event.inputs.semver }}
          build-command: |
            npm install
            npm run build
```

## Prerelease support

This action can be used to create prereleases.

In order to do that you can configure your action adding the [npm version](https://docs.npmjs.com/cli/v9/commands/npm-version) parameters `prerelease|prepatch|preminor|premajor` in the semver options.

It's possible to specify a custom `prerelease-prefix` if you want to have one. This will be added as a prefix to the prerelease version. Let's suppose we want to use `next` as a `prerelease-prefix`, the prerelease version will be something like: `v1.0.0-next.1`.

The `prerelease-prefix` is used as the input for the `--preid` in the `npm version` command.

An important note is that the `prerelease-prefix` is used to identify the release version, on the other hand we have the `npm-tag` which is responsible of identifying the proper [NPM tag](https://docs.npmjs.com/cli/v9/commands/npm-dist-tag) when a package is published to NPM, e.g.: `latest|experimental|next|rc|beta`.

Generally, if you want to release a prerelease of a repository, and it is an NPM package, you usually want to use `prerelease-prefix` and `npm-tag` inputs together.

Please note that in case of a prerelease the `sync-semver-tags` input will be treated as `false`, even if it's set to `true`. This because we don't want to update the main version tags to the latest prerelease commit but only to the latest official release.

## Inputs

| Input          | Required | Description                                                                                                                                                                                |
| ---            | ---      | ---                                                                                                                                                                                        |
| `github-token` | No      | This is your GitHub token, it's [already available](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#about-the-github_token-secret) to your GitHub action |
| `semver`       | Yes      | The version you want to bump. For more info please refer to [npm semver docs](https://docs.npmjs.com/about-semantic-versioning). Use `auto` to automatically determine the bump. verion                                                                                                                                        |
| `commit-message`| No      | The commit message template. The keyword `{version}` will be replaced with the new version.  (_Default: `Release {version}`_)                                                              |
| `npm-token`    | No       | This is your Npm Publish token. Read [how to create](https://docs.npmjs.com/creating-and-viewing-access-tokens#creating-tokens-on-the-website) access tokens. Required only if you want to release to Npm. If you omit this, no Npm release will be published. |
| `optic-url`    | No       | URL if you have a custom application that serves OTP. <br /> (_Default: <Optic service URL>_)                                                                                              |
| `optic-token`  | No       | This is your Optic token. You can add your Npm secret to the Optic app, generate a token and pass it to this input. <br /> (_If skipped, no OTP is requested while publishing. Useful when you want to use Automation token instead of Publish token. [Read more](https://docs.npmjs.com/creating-and-viewing-access-tokens#creating-tokens-on-the-website)_|
| `actor-name`   | No       | The name you want to see in the new release commit. <br /> (_Default: User who triggered the release workflow_)                                                                            |
| `actor-email`  | No       | The email you want to see in the new release commit. <br /> (_Default: User who triggered the release workflow_)                                                                           |
| `npm-tag`      | No       | If you want to release to the Npm with a custom tag, say `next`. <br /> (_Default: `latest`_)                                                                                             |
| `build-command`| No       | An optional build commit to run after the version bump and before releasing the package |
| `api-url`      | No       | GitHub App URL. You wouldn't need to set this unless you're deploying a custom GitHub app instead of [optic-release-automation](https://github.com/apps/optic-release-automation). <br /> (_Default: `https://optic-release-automation-ocrlhra4va-ue.a.run.app/`_) |
| `app-name`     | No       | GitHub App name. You also wouldn't need to set this unless you're deploying a custom GitHub app. <br /> (_Default: `optic-release-automation[bot]`_) |
| `sync-semver-tags`| No    | If you want to keep the major and minor versions git tags synced to the latest appropriate commit. Note: it will be evaluated as `false` in case of a prerelease. <br /> (_Default: `false`_)                                                                  |
| `notify-linked-issues`| No       | An optional flag to enable an automatic comment on all issues linked to each release so that people following those issues get notified of the code being released. <br /> (_Default: `true`_)                                                                  |
| `artifact-path`| No       | Set this input to the distribution folder or file you want to add as the main asset for your release. It will be downloadable from the release page and a preview of it will be available in the pull request.                                                                  |
| `version-prefix`       | No       | A prefix to apply to the version number, which reflects in the tag and GitHub release names. <br /> (_Default: 'v'_)                                                                                                                                                                                                                                         |
| `prerelease-prefix`       | No       | A prefix to apply to the prerelease version number.                                                                                                                                                                                                                                         |
| `base-tag`       | No       | Choose a specific tag release for your release notes. This input allows you to specify a base release (for example, v1.0.0) and will include all changes made in releases between the base release and the latest release. This input is only used for generating release notes and has no functional implications on the rest of the workflow.                                                                                                                                                                                                                                         |
## Motivation

*Why do I need this when I can create Npm automation tokens?*

> An automation token will bypass two-factor authentication when publishing. If you have two-factor authentication enabled, you will not be prompted when using an automation token, making it suitable for CI/CD workflows.

Although you can generate a Npm token that would let you bypass the OTP while publishing, this service lets you use the Publish token and generate a token on the fly while publishing. It will request Optic service which would request OTP from your phone and only after your approval, will the release proceed.
