const core = require('@actions/core')

const { logWarning } = require('./log')

exports.getInputs = () => ({
  GITHUB_TOKEN: core.getInput('github-token', { required: true }),
  NPM_TOKEN: core.getInput('npm-token', { required: true }),
  SEMVER: core.getInput('semver', { required: true })
})
