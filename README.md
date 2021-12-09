[![ci](https://github.com/nearform/optic-release-automation-action/actions/workflows/ci.yml/badge.svg)](https://github.com/nearform/optic-release-automation-action/actions/workflows/ci.yml)

# optic-release-automation-action

This action allows you to automate the release process of your npm modules. It can fetch OTP for Npm on the fly using [Optic](https://github.com/nearform/optic-expo).

### What does it do?

- When run, it opens a new PR for the release creating a new branch named `release/${new semver version}`.
- When/if the PR gets merged, it publishes a new Npm release and a new Github release with change logs

You can also use it for releases without Npm. In that case, when the PR merges, a new GitHub release will be published. Which you can use to trigger another workflow that deploys the app somewhere (GCP, AWS etc).

### Usage

- _(Optional)_ Install the [optic-release-automation](https://github.com/apps/optic-release-automation) GitHub app to your organization (or selected repositories)
- Create a new workflow file at `.github/workflows/release.yml` (from example below) with one step that uses this action and supply the inputs.

Note that the `on` triggers are mandatory:

- `workflow_dispatch`: to start the new release process
- `pull_request`: to complete the release process when the PR is merged

### Example

This example shows how to configure this action to release a new npm module version:

```yml
name: release

on:
  workflow_dispatch:
    inputs:
      semver:
        description: "The semver to use"
        required: true
        default: "patch"
      tag:
        description: "The npm tag"
        required: false
        default: "latest"
  pull_request:
    types: [closed]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: nearform/optic-release-automation-action@v2
        with:
          github-token: ${{secrets.github_token}}
          npm-token: ${{secrets.NPM_TOKEN}}
          optic-token: ${{secrets.OPTIC_TOKEN}}
          semver: ${{ github.event.inputs.semver }}
          npm-tag: ${{ github.event.inputs.tag }}
```

The above workflow (when manually triggered ⚡️) will:

- 🤖 Run `npm version <semver>` command to bump the version as configured (patch, minor, etc)
- 🤖 Open a PR that looks like following

![image](https://user-images.githubusercontent.com/2510597/140506212-4938e44d-0662-4dc5-9fb1-c3f59fe075a6.png)

When you merge this PR ⚡️:

- 🤖 It will request an Npm OTP from Optic. (If you close the PR, nothing will happen)
- 🤖 Upon successful retrieval of the OTP, it will publish the package to Npm.
- 🤖 Create a Github release with change logs (You can customize release notes using [release.yml](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes#example-configuration))


#### How to add a build step to your workflow

You may need to build your project before releasing it.
There are two build types:

- to be committed: the build output should be committed to the repository and appear in the PR opened by this action
- to be released: the build output should not be committed but its output should be published to Npm

To do it you need to add some extra steps to your workflow.

##### To be committed

In this example, the `npm run build` command will create some artifacts that can be committed to the repository.
Of course, you can use any build tool you need.
_These artifacts should not be listed in the `.gitignore` file._

The action will adds the changes in the new release PR.

```yml
name: build-and-release

on:
  workflow_dispatch:
    inputs:
      semver:
        description: "The semver to use"
        required: true
        default: "patch"
  pull_request:
    types: [closed]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: install your runtime
        uses: actions/setup-node@v2.5.0
        with:
          node-version: 16

      - name: build the project
        if: ${{ github.event_name == 'workflow_dispatch' }}
        run: |
          npm install
          npm run build

      - uses: nearform/optic-release-automation-action@v2
        with:
          github-token: ${{secrets.github_token}}
          npm-token: ${{secrets.NPM_TOKEN}}
          optic-token: ${{secrets.OPTIC_TOKEN}}
          semver: ${{ github.event.inputs.semver }}
```

_Another approach is to commit on your own the artifacts you want to release onto the new release branch._

When you merge the PR, the action will publish the artifacts to Npm as expected.

##### To be released

You may want to release the artifacts without committing them to the repository such as a `dist/` folder.
In this case, your workflow will look like this:

```yml
name: build-and-release

on:
  workflow_dispatch:
    inputs:
      semver:
        description: "The semver to use"
        required: true
        default: "patch"
  pull_request:
    types: [closed]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: install your runtime
        uses: actions/setup-node@v2.5.0
        with:
          node-version: 16

      - name: build the project when the PR is merged
        if: ${{ github.event_name == 'pull_request' }}
        run: |
          npm install
          npm run build

      - uses: nearform/optic-release-automation-action@v2
        with:
          github-token: ${{secrets.github_token}}
          npm-token: ${{secrets.NPM_TOKEN}}
          optic-token: ${{secrets.OPTIC_TOKEN}}
          semver: ${{ github.event.inputs.semver }}
```

_Another approach is to rely on the Npm [scripts](https://docs.npmjs.com/cli/v8/using-npm/scripts#pre--post-scripts) such as `prepare` or `prepublishOnly`._


### Inputs

| Input          | Required | Description                                                                                                                                                                                |
| ---            | ---      | ---                                                                                                                                                                                        |
| `github-token` | Yes      | This is your Github token, it's [already available](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#about-the-github_token-secret) to your Github action |
| `semver`       | Yes      | The version you want to bump (`patch|minor|major`).                                                                                                                                        |
| `npm-token`    | No       | This is your Npm Publish token. Read [how to create](https://docs.npmjs.com/creating-and-viewing-access-tokens#creating-tokens-on-the-website) acccess tokens. Required only if you want to release to Npm. If you omit this, no Npm release will be published.                              |
| `optic-url`    | No       | URL if you have a custom application that serves OTP. <br /> (_Default: <Optic service URL>_)                                                                                              |
| `optic-token`  | No       | This is your Optic token. You can add your Npm secret to the Optic app, generate a token and pass it to this input. <br /> (_If skipped, no OTP is requested while publishing. Useful when you want to use Automation token instead of Publish token. [Read more](https://docs.npmjs.com/creating-and-viewing-access-tokens#creating-tokens-on-the-website)_|
| `actor-name`   | No       | The name you want to see in the new release commit. <br /> (_Default: User who triggered the release workflow_)                                                                            |
| `actor-email`  | No       | The email you want to see in the new release commit. <br /> (_Default: User who triggered the release workflow_)                                                                           |
| `npm-tag`      | No       | If you want to release to the Npm with a custom tag, say `next`. <br /> (_Default: `latest`_)                                                                                              |
| `api-url`      | No       | GitHub App URL. You wouldn't need to set this unless you're deploying a custom GitHub app instead of [optic-release-automation](https://github.com/apps/optic-release-automation). <br /> (_Default: `https://optic-release-automation-ocrlhra4va-ue.a.run.app/`_)                                                                                              |
| `sync-semver-tags`      | No       | If you want to keep the major and minor versions tag synced to the latest appropriate commit <br /> (_Default: `false`_)                                                                                              |

## Motivation

*Why do I need this when I can create Npm automation tokens?*

> An automation token will bypass two-factor authentication when publishing. If you have two-factor authentication enabled, you will not be prompted when using an automation token, making it suitable for CI/CD workflows.

Although you can generate a Npm token that would let you bypass the OTP while publishing, this service lets you use the Publish token and generate a token on the fly while publishing. It will request Optic service which would request OTP from your phone and only after your approval, will the release proceed.
