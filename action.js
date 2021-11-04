'use strict'

const bump = require('./bump')
const release = require('./release')

module.exports = async function ({ github, context, inputs }) {
  if (context.eventName === 'workflow_dispatch') {
    return bump({ github, context, inputs })
  }

  if (context.eventName === 'pull_request') {
    return release({ github, context, inputs })
  }

  console.error('Unsupported event')
}
