'use strict'

const bump = require('./bump')
const release = require('./release')
const { runSpawn } = require('./util')

module.exports = async function ({ github, context, inputs }) {
  const run = runSpawn({ cwd: github.action_path })

  if (inputs['npm-token']) {
    await run('npm', [
      'config',
      'set',
      `//registry.npmjs.org/:_authToken=${inputs['npm-token']}`,
    ])
  }

  if (context.eventName === 'workflow_dispatch') {
    return bump({ github, context, inputs })
  }

  if (context.eventName === 'pull_request') {
    return release({ github, context, inputs })
  }

  console.error('Unsupported event')
}
