'use strict'

const bump = require('./bump')
const release = require('./release')
const { runSpawn } = require('./utils/runSpawn')
const { logError } = require('./log')

module.exports = async function ({ github, context, inputs }) {
  const run = runSpawn()

  let npmToken = null
  let opticToken = null
  let allSecrets = []

  try {
    allSecrets = JSON.parse(inputs['all-secrets'])
  } catch (error) {
    console.log('All secrets not specified')
  }

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
    npmToken = inputs['npm-token']
  }

  if (!opticToken) {
    opticToken = inputs['optic-token']
  }

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
