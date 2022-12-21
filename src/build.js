'use strict'

const core = require('@actions/core')
const { exec } = require('@actions/exec')
const parseReleaseMetadata = require('./utils/parseReleaseMetadata')

function getMonorepoData({ context, inputs, github }) {
  const pr = context?.payload?.pull_request
  const isOpticPr = pr?.user.login === inputs['app-name']

  if (github.event_name === 'pull_request' && isOpticPr) {
    return parseReleaseMetadata(pr)
  }

  return {
    monorepoPackage: inputs['monorepo-package'],
    monorepoRoot: inputs['monorepo-root'],
  }
}

module.exports = async function ({ github, context, inputs }) {
  try {
    const { monorepoPackage, monorepoRoot } = getMonorepoData({
      context,
      inputs,
      github,
    })

    const buildCommands = inputs['build-command']
      .trim()
      .split('\n')
      .filter(cmd => !!cmd)
      .map(cmd =>
        cmd
          .trim()
          .split(' ')
          .filter(c => !!c)
      )

    const options = {
      cwd: monorepoPackage ? `${monorepoRoot}/${monorepoPackage}` : '.',
    }

    await exec('node', ['-v'], options)
    await exec('npm', ['-v'], options)

    for (const [command, ...args] of buildCommands) {
      await exec(command, args, options)
    }
  } catch (err) {
    core.setFailed(`Error when building release: ${err.message}`)
  }
}
