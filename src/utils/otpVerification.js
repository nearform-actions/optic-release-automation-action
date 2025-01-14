'use strict'

const fs = require('fs')
const fastify = require('fastify')
const { logInfo, logError } = require('../log')

const otpHtml = fs.readFileSync(__dirname + '/assets/otp.html', 'utf8')

async function otpVerification(packageInfo) {
  const app = fastify()
  app.register(require('@fastify/formbody'))

  let otpPromiseResolve
  const otpPromise = new Promise(resolve => {
    otpPromiseResolve = resolve
  })

  const timeout = setTimeout(() => {
    otpPromiseResolve('')
    logError('OTP submission timed out.')
  }, 300000) // 5 minutes timeout

  app.get('/', async (req, reply) => {
    try {
      const updatedHtml = otpHtml
        .replace(/{{package-name}}/g, packageInfo.name)
        .replace(/{{package-version}}/g, packageInfo.version)

      reply.type('text/html').send(updatedHtml)
    } catch (err) {
      reply.code(500).send('Error loading HTML page')
      logError(`Failed to load HTML file:  ${err}`)
    }
  })

  app.post('/otp', async (req, reply) => {
    clearTimeout(timeout)
    logInfo(`Received OTP 1:  ${req.body.otp}`)
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
    await app.close()

    if (!otp) {
      throw new Error('No OTP received or submission timed out.')
    }
  } catch (err) {
    await app.close()
    logError(`Error during OTP collection:  ${err}`)
    throw err
  }

  logInfo(`Received OTP 2: ${otp}`)
  return otp
}

module.exports = otpVerification
