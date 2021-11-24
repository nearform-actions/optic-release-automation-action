# optic-release-automation-action

This action allows you to automate the release process of your npm modules. It can fetch OTP for Npm on the fly using [Optic](https://github.com/nearform/optic-expo).

### What does it do?

- When run, it opens a new PR for the release.
- When the PR gets merged, it publishes a new Npm release and a new Github release with change logs

### Inputs

| Input          | Required | Description                                                                                                                                                                                |
| ---            | ---      | ---                                                                                                                                                                                        |
| `github-token` | Yes      | This is your Github token, it's [already available](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#about-the-github_token-secret) to your Github action |
| `npm-token`    | Yes      | This is your Npm Publish token. Read [how to create](https://docs.npmjs.com/creating-and-viewing-access-tokens#creating-tokens-on-the-website) acccess tokens                              |
| `semver`       | Yes      | The version you want to bump (`patch|minor|major`).                                                                                                                                        |
| `optic-url`    | No       | URL if you have a custom application that serves OTP. <br /> (_Default: <Optic service URL>_)                                                                                              |
| `optic-token`  | No       | This is your Optic token. You can add your Npm secret to the Optic app, generate a token and pass it to this input. <br /> (_If skipped, no OTP is requested while publishing. Useful when you want to use Automation token instead of Publish token. [Read more](https://docs.npmjs.com/creating-and-viewing-access-tokens#creating-tokens-on-the-website)_|
| `actor-name`   | No       | The name you want to see in the new release commit. <br /> (_Default: User who triggered the release workflow_)                                                                            |
| `actor-email`  | No       | The email you want to see in the new release commit. <br /> (_Default: User who triggered the release workflow_)                                                                           |
| `npm-tag`      | No       | If you want to release to the Npm with a custom tag, say `next`. <br /> (_Default: `latest`_)                                                                                              |

### Example

To use this action, you can create a Github workflow with one step that uses this action and supply the inputs.

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
          github-token: ${{secrets.github_token}}
          npm-token: ${{secrets.NPM_TOKEN}}
          optic-token: ${{secrets.OPTIC_TOKEN}}
          semver: ${{ github.event.inputs.semver }}
          npm-tag: ${{ github.event.inputs.tag }}
```

The above example workflow will

- Run `npm version <semver>` command to bump the version as configured (patch, minor, etc)
- Open a PR that looks like following

![image](https://user-images.githubusercontent.com/2510597/140506212-4938e44d-0662-4dc5-9fb1-c3f59fe075a6.png)

- When you merge this PR, it will request an Npm OTP from Optic. (If you close the PR, nothing will happen)
- Upon successful retrieval of the OTP, it will publish the package to Npm.
- Create a Github release with change logs (You can customize release notes using [release.yml](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes#example-configuration))


## Motivation

*Why do I need this when I can create Npm automation tokens?*

> An automation token will bypass two-factor authentication when publishing. If you have two-factor authentication enabled, you will not be prompted when using an automation token, making it suitable for CI/CD workflows.

Although you can generate an Npm token that would let you bypass the OTP while publishing, this service let's you use the Publish token and generate a token on the fly while publishing. It will request Optic service which would request OTP from your phone and only after your approval, will the release proceed.
