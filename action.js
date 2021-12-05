'use strict'

const bump = require('./bump')
const release = require('./release')
const { runSpawn } = require('./utils/runSpawn')
const { logError } = require('./log')

module.exports = async function ({ github, context, inputs }) {
  const run = runSpawn()

  let npmToken = null
  let opticToken = null

  const allSecrets = JSON.parse(inputs['all-secrets'])

  function getToken(type, secret, value) {
    if (
      secret.toLowerCase().startsWith(type) &&
      value.startsWith(inputs['actor-name'])
    ) {
      return value.split(':')[1]
    }
    return null
  }

  for (const [secret, value] of Object.entries(allSecrets)) {
    npmToken = npmToken || getToken('npm_token_', secret, value)
    opticToken = opticToken || getToken('optic_token_', secret, value)
  }

  // Default to npm-token
  if (!npmToken) {
    console.log('No npm token found, using npm-token')
    npmToken = inputs['npm-token']
  }

  if (!opticToken) {
    console.log('No optic token found, using optic-token')
    opticToken = inputs['optic-token']
  }

  console.log('npmToken', npmToken)
  console.log('opticToken', opticToken)

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
