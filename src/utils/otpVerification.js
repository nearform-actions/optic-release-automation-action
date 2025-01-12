'use strict'

const fs = require('fs')
const fastify = require('fastify')
const ngrok = require('@ngrok/ngrok')
const { logInfo } = require('../log')

const otpHtml = fs.readFileSync(__dirname + '/assets/otp.html', 'utf8')

async function otpVerification(packageInfo, ngrokToken) {
  const app = fastify()
  app.register(require('@fastify/formbody'))

  let otpPromiseResolve
  const otpPromise = new Promise(resolve => {
    otpPromiseResolve = resolve
  })

  const timeout = setTimeout(() => {
    otpPromiseResolve('')
    console.error('OTP submission timed out.')
  }, 300000) // 5 minutes timeout

  app.get('/', async (req, reply) => {
    try {
      const updatedHtml = otpHtml
        .replace(/{{package-name}}/g, packageInfo.name)
        .replace(/{{package-version}}/g, packageInfo.version)

      reply.type('text/html').send(updatedHtml)
    } catch (err) {
      reply.code(500).send('Error loading HTML page')
      console.error('Failed to load HTML file:', err)
    }
  })

  app.post('/otp', async (req, reply) => {
    clearTimeout(timeout)
    logInfo('Received OTP:', req.body.otp)
    otpPromiseResolve(req.body.otp)
    reply.send('OTP received. You can close this window.')
  })

  let otp
  let listener

  try {
    await app.listen({ port: 3000 })

    listener = await ngrok.forward({
      addr: 3000,
      authtoken: ngrokToken, // Using the token passed as parameter
      session_metadata: 'OTP Collection Server',
    })
    const ngrokUrl = listener.url()
    console.log('Please visit this URL to provide the OTP:', ngrokUrl)

    otp = await otpPromise

    // Cleanup
    await ngrok.disconnect(ngrokUrl)
    await ngrok.kill()
    await app.close()

    if (!otp) {
      throw new Error('No OTP received or submission timed out.')
    }
  } catch (err) {
    // Ensure cleanup even if there's an error
    if (listener) {
      await ngrok.disconnect(listener.url())
      await ngrok.kill()
    }

    await app.close()
    console.error('Error during OTP collection:', err)
    throw err
  }

  console.log('Received OTP:', otp)
  return otp
}

module.exports = otpVerification
