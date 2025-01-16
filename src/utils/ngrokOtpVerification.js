'use strict'

const fs = require('fs')
const fastify = require('fastify')
const { logInfo, logError } = require('../log')

const otpHtml = fs.readFileSync(__dirname + '/assets/otp.html', 'utf8')
const otpVerificationTimeout = 300000 // 5 minutes;

async function otpVerification(packageInfo) {
  const app = fastify()

  let otpPromiseResolve
  let otpPromiseReject

  const otpPromise = new Promise((resolve, reject) => {
    otpPromiseResolve = resolve
    otpPromiseReject = reject
  })

  const timeout = setTimeout(() => {
    logError('OTP submission timed out.')
    otpPromiseReject()
  }, otpVerificationTimeout)

  app.get('/', async (req, reply) => {
    try {
      const updatedHtml = otpHtml
        .replace(/{{package-name}}/g, packageInfo.name)
        .replace(/{{package-version}}/g, packageInfo.version)

      reply.type('text/html').send(updatedHtml)
    } catch (err) {
      logError(`err:  ${err}`)
      reply.code(500).send('Error loading HTML page')
    }
  })

  app.post('/otp', async (req, reply) => {
    clearTimeout(timeout)
    logInfo(`Received OTP : ${req.body.otp}`)
    otpPromiseResolve(req.body.otp)
    reply.send('OTP received. You can close this window.')
  })

  let otp

  try {
    await app.listen({ port: 3000 })

    logInfo(
      `Please visit this URL to provide the OTP:
      ${packageInfo.tunnelUrl}`
    )

    otp = await otpPromise

    return otp
  } finally {
    await app.close()
  }
}

module.exports = otpVerification
