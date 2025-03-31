'use strict'

const fs = require('fs')
const fastify = require('fastify')
const { logInfo, logError } = require('../log')
const getNgrok = require('./getNgrok')

const otpVerificationTimeout = 300000 // 5 minutes;
async function ngrokOtpVerification(packageInfo, ngrokToken, abortSignal) {
  const app = fastify()
  const otpHtml = fs.readFileSync(__dirname + '/assets/otp.html', 'utf8')

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

  abortSignal?.addEventListener('abort', () => {
    clearTimeout(timeout)
    otpPromiseReject('Aborted')
  })

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

  const ngrok = await getNgrok()
  try {
    await app.listen({ port: 3000 })

    const url = await ngrok.connect({
      addr: 3000,
      proto: 'http',
      authtoken: ngrokToken,
    })

    logInfo(
      `Please visit this URL to provide the OTP:
      ${url}`
    )

    const otp = await otpPromise
    return otp
  } finally {
    await app.close()
    await ngrok.kill()
  }
}

module.exports = ngrokOtpVerification
