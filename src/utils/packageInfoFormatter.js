'use strict'

/**
 * Creates a standardized package info object that can be safely used with JSON.stringify
 * and in the otpVerification method
 * @param {string} version - The package version
 * @param {string} packageName - The package name
 * @returns {Object} Formatted package info object
 */
const formatPackageInfo = (version, packageName) => {
  return {
    packageInfo: {
      version: version || '',
      name: packageName || '',
    },
  }
}

module.exports = {
  formatPackageInfo,
}
