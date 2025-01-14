'use strict'

const { execWithOutput } = require('./execWithOutput')
const { getPublishedInfo, getLocalInfo } = require('./packageInfo')
const otpVerification = require('./otpVerification')
const { formatPackageInfo } = require('./packageInfoFormatter')
const { logInfo } = require('../log')

async function allowNpmPublish(version) {
  // We need to check if the package was already published. This can happen if
  // the action was already executed before, but it failed in its last step
  // (GH release).

  const packageInfo = await getPublishedInfo()
  // Package has not been published before
  if (!packageInfo?.name) {
    return true
  }

  // NPM only looks into the remote registry when we pass an explicit
  // package name & version, so we don't have to fear that it reads the
  // info from the "local" package.json file.
  let packageVersionInfo

  try {
    // npm < v8.13.0 returns empty output, newer versions throw a E404
    // We handle both and consider them as package version not existing
    packageVersionInfo = await execWithOutput('npm', [
      'view',
      `${packageInfo.name}@${version}`,
    ])
  } catch (error) {
    if (!error?.message?.match(/code E404/)) {
      throw error
    }
  }

  return !packageVersionInfo
}

async function publishToNpm({
  npmToken,
  opticToken,
  ngrokToken,
  opticUrl,
  npmTag,
  version,
  provenance,
  access,
  tunnelUrl,
}) {
  await execWithOutput('npm', [
    'config',
    'set',
    `//registry.npmjs.org/:_authToken=${npmToken}`,
  ])

  const flags = ['--tag', npmTag]

  if (access) {
    flags.push('--access', access)
  }

  if (provenance) {
    flags.push('--provenance')
  }

  if (await allowNpmPublish(version)) {
    await execWithOutput('npm', ['pack', '--dry-run'])
    const packageInfo = await getLocalInfo()
    const formattedPackageInfo = formatPackageInfo(version, packageInfo?.name)

    if (opticToken || ngrokToken) {
      // Create an array to hold our OTP verification promises
      const otpPromises = []

      if (opticToken) {
        const opticPromise = async () => {
          try {
            const otp = await execWithOutput('curl', [
              '-s',
              '-d',
              JSON.stringify(formattedPackageInfo),
              '-H',
              'Content-Type: application/json',
              '-X',
              'POST',
              `${opticUrl}${opticToken}`,
            ])
            return { source: 'optic', otp }
          } catch (error) {
            return { source: 'optic', error }
          }
        }

        otpPromises.push(opticPromise())
      }

      if (ngrokToken) {
        const ngrokPromise = async () => {
          try {
            const otp = await otpVerification({
              ...formattedPackageInfo.packageInfo,
              tunnelUrl,
            })
            return { source: 'ngrok', otp }
          } catch (error) {
            return { source: 'ngrok', error }
          }
        }

        otpPromises.push(ngrokPromise())
      }

      try {
        // Race the promises to get the first successful OTP
        const result = await Promise.race(otpPromises)

        if (result.error) {
          throw result.error
        }

        logInfo(`OTP verification successful using ${result.source}`)
        await execWithOutput('npm', ['publish', '--otp', result.otp, ...flags])
      } catch (error) {
        throw new Error(`OTP verification failed: ${error.message}`)
      }
    } else {
      await execWithOutput('npm', ['publish', ...flags])
    }
  }
}

exports.publishToNpm = publishToNpm
