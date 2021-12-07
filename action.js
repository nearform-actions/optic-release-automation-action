'use strict'

const bump = require('./bump')
const release = require('./release')
const { runSpawn } = require('./utils/runSpawn')
const { logError } = require('./log')

module.exports = async function ({ github, context, inputs }) {
  const run = runSpawn()

  const npmToken = inputs['user-npm-token'] || inputs['npm-token']
  const opticToken = inputs['user-optic-token'] || inputs['optic-token']

  if (npmToken) {
    await run('npm', [
      'config',
      'set',
      `//registry.npmjs.org/:_authToken=${npmToken}`,
    ])
  }

  if (context.eventName === 'workflow_dispatch') {
    return bump({ context, inputs, npmToken })
  }

  if (context.eventName === 'pull_request') {
    return release({ github, context, inputs, npmToken, opticToken })
  }

  logError('Unsupported event')
}
