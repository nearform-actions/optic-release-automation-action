'use strict'

const { execWithOutput } = require('./execWithOutput')
const { getPublishedInfo, getLocalInfo } = require('./packageInfo')
const ngrokOtpVerification = require('./ngrokOtpVerification')

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
  publishMode,
}) {
  const isOidc = publishMode === 'oidc'

  // Configure token auth only if not using OIDC
  if (!isOidc && npmToken) {
    await execWithOutput('npm', [
      'config',
      'set',
      `//registry.npmjs.org/:_authToken=${npmToken}`,
    ])
  }

  const flags = ['--tag', npmTag]

  if (access) {
    flags.push('--access', access)
  }

  // In OIDC mode, npm will handle provenance automatically; avoid --provenance
  if (provenance && !isOidc) {
    flags.push('--provenance')
  }

  if (await allowNpmPublish(version)) {
    await execWithOutput('npm', ['pack', '--dry-run'])
    const localInfo = await getLocalInfo()

    // If OIDC is enabled, publish without OTP flow; npm will use OIDC automatically
    if (isOidc) {
      await execWithOutput('npm', ['publish', ...flags])
    } else if (opticToken || ngrokToken) {
      try {
        const otpPromises = []
        const abortCtrl = new AbortController()

        if (opticToken) {
          otpPromises.push(
            execWithOutput('curl', [
              '-s',
              '-d',
              JSON.stringify({
                packageInfo: { version, name: localInfo?.name },
              }),
              '-H',
              'Content-Type: application/json',
              '-X',
              'POST',
              `${opticUrl}${opticToken}`,
            ])
          )
        }

        if (ngrokToken) {
          otpPromises.push(
            ngrokOtpVerification(
              {
                version,
                name: localInfo?.name,
              },
              ngrokToken,
              abortCtrl.signal
            )
          )
        }
        const otp = await Promise.race(otpPromises)
        abortCtrl.abort()
        await execWithOutput('npm', ['publish', '--otp', otp, ...flags])
      } catch (error) {
        throw new Error(`OTP verification failed: ${error.message}`)
      }
    } else {
      await execWithOutput('npm', ['publish', ...flags])
    }
  }
}

exports.publishToNpm = publishToNpm
