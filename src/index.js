'use strict'

const openPr = require('./openPr')
const release = require('./release')
const { logError } = require('./log')

module.exports = async function ({
  github,
  context,
  inputs,
  secrets,
  packageVersion,
}) {
  if (context.eventName === 'workflow_dispatch') {
    return openPr({ context, inputs, packageVersion })
  }

  if (context.eventName === 'pull_request') {
    return release({ github, context, inputs, secrets })
  }

  logError('Unsupported event')
}
