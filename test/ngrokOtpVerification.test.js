'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')

const setup = () => {
  const logInfoStub = sinon.stub()
  const logErrorStub = sinon.stub()

  // Mock Fastify instance
  const mockApp = {
    get: sinon.stub(),
    post: sinon.stub(),
    register: sinon.stub(),
    listen: sinon.stub().resolves(),
    close: sinon.stub().resolves(),
  }

  const fastifyStub = sinon.stub().returns(mockApp)

  const ngrokOtpVerificationProxy = proxyquire(
    '../src/utils/ngrokOtpVerification',
    {
      fastify: fastifyStub,
      '../log': {
        logInfo: logInfoStub,
        logError: logErrorStub,
      },
      './getNgrok': async () => ({
        connect: sinon.stub().resolves('https://test.ngrok.io'),
        kill: sinon.stub().resolves(),
      }),
    }
  )

  return {
    logInfoStub,
    logErrorStub,
    mockApp,
    ngrokOtpVerificationProxy,
  }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('Should successfully verify OTP', async t => {
  const { ngrokOtpVerificationProxy, mockApp } = setup()

  // Capture the OTP callback
  let otpCallback
  mockApp.post.withArgs('/otp').callsFake((path, handler) => {
    otpCallback = handler
  })

  // Start OTP verification process
  const otpPromise = ngrokOtpVerificationProxy(
    {
      name: 'test-package',
      version: 'v1.0.0',
    },
    'ngrok-token'
  )

  // Simulate OTP submission
  await otpCallback(
    {
      body: { otp: '123456' },
    },
    {
      send: sinon.stub(),
    }
  )

  const otp = await otpPromise
  t.equal(otp, '123456', 'should return submitted OTP')
})

tap.test('Should timeout after 5 minutes', async t => {
  const { ngrokOtpVerificationProxy, logErrorStub } = setup()

  // Use fake timers
  const clock = sinon.useFakeTimers()

  try {
    const promise = ngrokOtpVerificationProxy(
      {
        name: 'test-package',
        version: 'v1.0.0',
      },
      'ngrok-token'
    )

    // Advance clock by 5 minutes + 1ms
    clock.tick(300001)

    await t.rejects(promise)

    t.ok(logErrorStub.calledWith('OTP submission timed out.'))
  } finally {
    clock.restore()
  }
})

tap.test('Should handle HTML template rendering', async t => {
  const { ngrokOtpVerificationProxy, mockApp } = setup()

  let renderedHtml
  let otpHandler

  // Store the OTP handler when registered
  mockApp.post.withArgs('/otp').callsFake((path, handler) => {
    otpHandler = handler
  })

  mockApp.get.withArgs('/').callsFake((path, handler) => {
    handler(
      {},
      {
        type: () => ({
          send: html => {
            renderedHtml = html
          },
        }),
      }
    )
  })

  // Start OTP verification process in background
  const otpPromise = ngrokOtpVerificationProxy({
    name: 'test-package',
    version: 'v1.0.0',
  })

  // Submit OTP immediately after handlers are set up
  setImmediate(() => {
    if (otpHandler) {
      otpHandler({ body: { otp: '123456' } }, { send: sinon.stub() })
    }
  }, 'ngrok-token')

  await otpPromise

  t.match(renderedHtml, /test-package/, 'should include package name')
  t.match(renderedHtml, /v1.0.0/, 'should include package version')
})

tap.test(
  'Should handle the failure case when fastify app or html fails to load',
  async t => {
    const { ngrokOtpVerificationProxy, mockApp } = setup()

    let otpHandler

    // Store the OTP handler when registered
    mockApp.post.withArgs('/otp').callsFake((path, handler) => {
      otpHandler = handler
    })
    const sendSpy = sinon.spy()
    const codeSpy = sinon.stub().returns({ send: sendSpy })
    mockApp.get.withArgs('/').callsFake((path, handler) => {
      handler(
        {},
        {
          type: () => ({
            send: () => {
              throw new Error('Mock send error')
            },
          }),
          code: codeSpy,
        }
      )
    })

    // Start OTP verification process in background
    const otpPromise = ngrokOtpVerificationProxy(
      {
        name: 'test-package',
        version: 'v1.0.0',
      },
      'ngrok-token'
    )

    // Submit OTP immediately after handlers are set up
    setImmediate(() => {
      if (otpHandler) {
        otpHandler({ body: { otp: '123456' } }, { send: sinon.stub() })
      }
    })

    await otpPromise

    t.ok(codeSpy.calledWith(500), 'should set 500 status code')
    t.ok(
      sendSpy.calledWith('Error loading HTML page'),
      'should send error message'
    )

    // Or if using tap assertions:
    t.equal(
      codeSpy.firstCall.args[0],
      500,
      'should set correct error status code'
    )
    t.equal(
      sendSpy.firstCall.args[0],
      'Error loading HTML page',
      'should send correct error message'
    )
  }
)
