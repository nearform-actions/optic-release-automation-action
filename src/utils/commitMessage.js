'use strict'

const format = require('string-format')

const transformCommitMessage = (template, version) => {
  return format(template.replace(/"/g, '\\"'), { version })
}

module.exports = transformCommitMessage
