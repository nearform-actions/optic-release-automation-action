'use strict'

const core = require('@actions/core')
const { exec } = require('@actions/exec')
const parseReleaseMetadata = require('./utils/parseReleaseMetadata')

function getMonorepoData({ context, inputs }) {
  if (context?.payload?.pull_request) {
    return parseReleaseMetadata(context.payload.pull_request)
  }

  return {
    monorepoPackage: inputs['monorepo-package'],
    monorepoRoot: inputs['monorepo-root'],
  }
}

module.exports = async function ({ context, inputs }) {
  const { monorepoPackage, monorepoRoot } = getMonorepoData({ context, inputs })

  const buildCommands = inputs['build-command']
    .trim()
    .split('\n')
    .map(cmd => cmd.trim().split(' '))

  const options = {
    cwd: monorepoPackage ? `${monorepoRoot}/${monorepoPackage}` : '.',
  }

  try {
    await exec('node', ['-v'], options)
    await exec('npm', ['-v'], options)

    for (const [command, ...args] of buildCommands) {
      await exec(command, args, options)
    }
  } catch (err) {
    if (monorepoPackage) {
      core.setFailed(
        `Error when building package: ${monorepoPackage}\n${err.message}`
      )
    } else {
      core.setFailed(`Error when building release: ${err.message}`)
    }
  }
}
