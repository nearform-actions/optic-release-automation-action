[![ci](https://github.com/nearform/optic-release-automation-action/actions/workflows/ci.yml/badge.svg)](https://github.com/nearform/optic-release-automation-action/actions/workflows/ci.yml)

# optic-release-automation-action

This action allows you to automate the release process of your npm modules. It can fetch OTP for Npm on the fly using [Optic](https://github.com/nearform/optic-expo).

### What does it do?

- When run, it opens a new PR for the release.
- When/if the PR gets merged, it publishes a new Npm release and a new GitHub release with change logs

You can also use it for releases without Npm. In that case, when the PR merges, a new GitHub release will be published. Which you can use to trigger another workflow that deploys the app somewhere (GCP, AWS etc).

### Usage

- Install the [optic-release-automation](https://github.com/apps/optic-release-automation) GitHub app to your organization (or selected repositories)
- Create a new workflow file at `.github/workflows/release.yml` (from example below) with one step that uses this action and supply the inputs.

#### Example

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
      - uses: nearform/optic-release-automation-action@main # you can use a tag instead of main
        with:
          github-token: ${{ secrets.github_token }}
          npm-token: ${{ secrets.NPM_TOKEN }}
          optic-token: ${{ secrets.OPTIC_TOKEN }}
          semver: ${{ github.event.inputs.semver }}
          npm-tag: ${{ github.event.inputs.tag }}
```

The above workflow (when manually triggered) will

- Run `npm version <semver>` command to bump the version as configured (patch, minor, etc)
- Open a PR that looks like following

![image](https://user-images.githubusercontent.com/2510597/140506212-4938e44d-0662-4dc5-9fb1-c3f59fe075a6.png)

- When you merge this PR, it will request an Npm OTP from Optic. (If you close the PR, nothing will happen)
- (Optional) You can define Npm and Optic tokens in GitHub secrets for each user that will receive the OTP. This is required only in case you want to publish to Npm.
- Create a GitHub release with change logs (You can customize release notes using [release.yml](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes#example-configuration))
- Upon successful retrieval of the OTP, it will publish the package to Npm.

### Multiple user scenario

In case there are multiple users who have access to trigger the release automation action, you can define Npm and Optic tokens for different users in GitHub secrets. Following is an example of a way to use different tokens depending on the user who merged the pull request.   

#### Example:  
  - Use only default tokens:   
    *e.g.* `npm-token: ${{ secrets.NPM_TOKEN }}`
  - Use only user-related tokens:   
    *e.g.* `npm-token: ${{ secrets[format('NPM_TOKEN_{0}', github.actor)] }}`
  - Use both user-related and default token:   
    *e.g.* `npm-token: ${{ secrets[format('NPM_TOKEN_{0}', github.actor)] || secrets.NPM_TOKEN }}`

```yml
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: nearform/optic-release-automation-action@main # you can use a tag instead of main
        with:
          github-token: ${{ secrets.github_token }}
          npm-token: ${{ secrets[format('NPM_TOKEN_{0}', github.actor)] || secrets.NPM_TOKEN }}
          optic-token: ${{ secrets[format('OPTIC_TOKEN_{0}', github.actor)] || secrets.OPTIC_TOKEN }}
          semver: ${{ github.event.inputs.semver }}
          npm-tag: ${{ github.event.inputs.tag }}
```

*Note*: Not all symbols that can be used in GitHub usernames are valid in secret names. One such example is the hyphen symbol (`-`). In such cases, this approach will not work. 

### Inputs

| Input          | Required | Description                                                                                                                                                                                |
| ---            | ---      | ---                                                                                                                                                                                        |
| `github-token` | Yes      | This is your GitHub token, it's [already available](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#about-the-github_token-secret) to your GitHub action |
| `semver`       | Yes      | The version you want to bump (`patch|minor|major`).                                                                                                                                        |
| `commit-message`       | Yes      |The commit message template. The keyword "{version}" will be replaced with the new version).                                                                                                                                        |
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
