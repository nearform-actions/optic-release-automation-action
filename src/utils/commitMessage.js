'use strict'

const format = require('string-format')

const transformCommitMessage = (template, version, packageName) => {
  return format(template.replace(/"/g, '\\"'), { version, packageName })
}

module.exports = transformCommitMessage
