'use strict'
const semver = require('semver')
const { execWithOutput } = require('./execWithOutput')

/**
 * Abort if the user specified they want NPM provenance, but their CI's NPM version doesn't support it.
 * If we continued, the release will go ahead with no warnings, and no provenance will be generated.
 */
function checkIsSupported(npmVersion) {
  const validNpmVersion = '>=9.5.0'

  if (!semver.satisfies(npmVersion, validNpmVersion)) {
    throw new Error(
      `Provenance requires NPM ${validNpmVersion}, but this action is using v${npmVersion}.
Either remove provenance from your release action's inputs, or update your release CI's NPM version.`
    )
  }
}

/**
 * Abort with a meaningful error if the user would get a misleading error message from NPM
 * due to an NPM bug that existed between 9.5.0 and 9.6.1.
 * As of April 2023, this would affect anyone whose CI is set to Node 18 (which defaults to NPM 9.5.1).
 */
function checkPermissions(npmVersion) {
  // Bug was fixed in this NPM version - see https://github.com/npm/cli/pull/6226
  const correctNpmErrorVersion = '>=9.6.1'

  if (
    // Same test condition as in fixed versions of NPM
    !process.env.ACTIONS_ID_TOKEN_REQUEST_URL &&
    // Let NPM handle this itself after their bug was fixed, so we're not brittle against future changes
    !semver.satisfies(npmVersion, correctNpmErrorVersion)
  ) {
    throw new Error(
      // Same error message as in fixed versions of NPM
      'Provenance generation in GitHub Actions requires "write" access to the "id-token" permission'
    )
  }
}

/**
 * Fail fast and throw a meaningful error if NPM Provenance will fail silently or misleadingly.
 *
 * @see https://docs.npmjs.com/generating-provenance-statements
 *
 * @param {string} npmVersion
 */
function checkProvenanceViability(npmVersion) {
  if (!npmVersion) throw new Error('Current npm version not provided')
  checkIsSupported(npmVersion)
  checkPermissions(npmVersion)
  // There are various other provenance requirements, such as specific package.json properties, but these
  // may change in future NPM versions, and do fail with meaningful errors, so we let NPM handle those.
}

/**
 * Gets npm version via `npm -v` on the command line.
 * Split out as its own export so it can be easily mocked in tests.
 */
async function getNpmVersion() {
  return execWithOutput('npm', ['-v'])
}

module.exports = {
  checkProvenanceViability,
  getNpmVersion,
  checkIsSupported,
  checkPermissions,
}
