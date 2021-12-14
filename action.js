'use strict'

const openPr = require('./openPr')
const release = require('./release')
const { logError } = require('./log')

module.exports = async function ({ action, github, context, inputs }) {
  if (action === 'open_pr') {
    return openPr({ context, inputs })
  }

  if (action === 'release') {
    return release({ github, context, inputs })
  }

  logError('Unsupported event')
}
