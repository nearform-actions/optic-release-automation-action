# optic-release-automation

This action allows you to automate the release process of your npm modules. It can fetch OTP for Npm on the fly using [Optic](https://github.com/nearform/optic-expo).

### Options

- `github-token`: Your Github token (Available in the action).
- `npm-token`: Your Npm token (You can add it in Github secrets).
- `optic-token`: (Optional) Your Optic token (You can add it in Github secrets). If skipped, it will try to publish to npm without an OTP.
- `actor-name`: The name you want to see in the new release commit.
- `actor-email`: The email you want to see in the new release commit.
- `semver`: The version you want to bump (`patch|minor|major`).
- `optic-url`: (Optional) Optic URL if you have a custom application that serves OTP.
- `npm-tag`: (Optional) (Default: `latest`) If you want to release to the Npm with a custom tag, say `next`.

### Example

To use this action, you can create a Github manual workflow with one step that uses this action and supply the options.

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

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: nearform/optic-release-automation@main
        with:
          github-token: ${{secrets.github_token}}
          npm-token: ${{secrets.NPM_TOKEN}}
          optic-token: ${{secrets.OPTIC_TOKEN}}
          actor-name: ${{ github.actor }}
          actor-email: "actions@users.noreply.github.com"
          semver: ${{ github.event.inputs.semver }}
          npm-tag: ${{ github.event.inputs.tag }}
```

This workflow will

- Run `npm version <semver>` command to bump the version as configured
- Request Npm OTP from Optic
- Upon successful retrieval of the OTP, it will publish the package to Npm.
- Push the new commit to your repo.
- Create a Github release with change logs (You can customize release notes using [release.yml](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes#example-configuration))


## Motivation

*Why do I need this when I can create Npm automation tokens?*

Although you can generate an Npm token that would let you bypass the MFA while publishing, this service let's you use the regular token and generate a token on the fly while publishing. It will request Optic service which would request OTP from your phone and only after your approval, will the release proceed.
