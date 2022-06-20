'use strict'

const openPr = require('./openPr')
const release = require('./release')
const { logError } = require('./log')

module.exports = async function ({
  github,
  context,
  inputs,
  packageVersion,
  packageName,
}) {
  if (context.eventName === 'workflow_dispatch') {
    return openPr({ context, inputs, packageVersion })
  }

  if (context.eventName === 'pull_request') {
    return release({ github, context, inputs, packageVersion, packageName })
  }

  logError('Unsupported event')
}
