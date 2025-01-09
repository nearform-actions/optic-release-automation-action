'use strict'

const fs = require('fs')
const fastify = require('fastify')
const localtunnel = require('localtunnel')
const { logInfo } = require('../log')

const otpHtml = fs.readFileSync(__dirname + '/assets/otp.html', 'utf8')

async function collectOtp() {
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

  // app.get('/', (req, reply) => {
  //   reply.type('text/html').send(`
  //     <form action="/otp" method="POST">
  //       <input type="text" name="otp" required />
  //       <button type="submit">Submit OTP</button>
  //     </form>
  //   `)
  // })

  // Serve static HTML file
  // app.get('/', (req, reply) => {
  //   reply.sendFile('otp.html') // Serve 'public/otp.html'
  // })

  app.get('/', async (req, reply) => {
    try {
      reply.type('text/html').send(otpHtml)
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

module.exports = collectOtp
