'use strict'

const fastify = require('fastify')
const localtunnel = require('localtunnel')

async function collectOtp() {
  const app = fastify()
  app.register(require('@fastify/formbody')) // Parse POST data

  let otpPromiseResolve
  const otpPromise = new Promise(resolve => {
    otpPromiseResolve = resolve
  })

  const timeout = setTimeout(() => {
    otpPromiseResolve('')
    console.error('OTP submission timed out.')
  }, 300000) // 5 minutes timeout

  app.get('/', (req, reply) => {
    reply.type('text/html').send(`
      <form action="/otp" method="POST">
        <input type="text" name="otp" required />
        <button type="submit">Submit OTP</button>
      </form>
    `)
  })

  app.post('/otp', async (req, reply) => {
    clearTimeout(timeout)
    otpPromiseResolve(req.body.otp)
    reply.send('OTP received. You can close this window.')
  })

  let otp
  try {
    await app.listen({ port: 3000 })
    const tunnel = await localtunnel({ port: 3000 })

    console.log('Please visit this URL to provide the OTP:', tunnel.url)

    otp = await otpPromise

    tunnel.close()
    await app.close()

    if (!otp) {
      throw new Error('No OTP received or submission timed out.')
    }
  } catch (err) {
    console.error('Error during OTP collection:', err)
    throw err
  }

  console.log('Received OTP:', otp)
  return otp
}

module.exports = { collectOtp }
