'use strict'

const { describe, afterEach, it } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const { mockModule } = require('./mockModule.js')

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

  const ngrokOtpVerificationProxy = mockModule(
    '../src/utils/ngrokOtpVerification.js',
    {
      fastify: {
        defaultExport: fastifyStub,
      },
      '../src/log.js': {
        namedExports: {
          logInfo: logInfoStub,
          logError: logErrorStub,
        },
      },
      '../src/utils/getNgrok.js': {
        defaultExport: async () => ({
          connect: sinon.stub().resolves('https://test.ngrok.io'),
          kill: sinon.stub().resolves(),
        }),
      },
    }
  )

  return {
    logInfoStub,
    logErrorStub,
    mockApp,
    ngrokOtpVerificationProxy,
  }
}

describe('ngrok otp tests', async () => {
  afterEach(() => {
    sinon.restore()
  })

  it('Should successfully verify OTP', async () => {
    const { ngrokOtpVerificationProxy, mockApp } = setup()

    let otpCallback
    mockApp.post.withArgs('/otp').callsFake((path, handler) => {
      otpCallback = handler
    })

    const otpPromise = ngrokOtpVerificationProxy(
      {
        name: 'test-package',
        version: 'v1.0.0',
      },
      'ngrok-token'
    )

    await otpCallback(
      {
        body: { otp: '123456' },
      },
      {
        send: sinon.stub(),
      }
    )

    const otp = await otpPromise
    assert.strictEqual(otp, '123456', 'should return submitted OTP')
  })

  it('Should timeout after 5 minutes', async () => {
    const { ngrokOtpVerificationProxy, logErrorStub } = setup()

    const clock = sinon.useFakeTimers()

    try {
      const promise = ngrokOtpVerificationProxy(
        {
          name: 'test-package',
          version: 'v1.0.0',
        },
        'ngrok-token'
      )

      clock.tick(300001)

      await assert.rejects(promise)
      assert.ok(logErrorStub.calledWith('OTP submission timed out.'))
    } finally {
      clock.restore()
    }
  })

  it('Should handle HTML template rendering', async () => {
    const { ngrokOtpVerificationProxy, mockApp } = setup()

    let renderedHtml
    let otpHandler

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

    const otpPromise = ngrokOtpVerificationProxy({
      name: 'test-package',
      version: 'v1.0.0',
    })

    setImmediate(() => {
      if (otpHandler) {
        otpHandler({ body: { otp: '123456' } }, { send: sinon.stub() })
      }
    }, 'ngrok-token')

    await otpPromise

    assert.match(renderedHtml, /test-package/, 'should include package name')
    assert.match(renderedHtml, /v1.0.0/, 'should include package version')
  })

  it('Should handle the failure case when fastify app or html fails to load', async () => {
    const { ngrokOtpVerificationProxy, mockApp } = setup()

    let otpHandler

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

    const otpPromise = ngrokOtpVerificationProxy(
      {
        name: 'test-package',
        version: 'v1.0.0',
      },
      'ngrok-token'
    )

    setImmediate(() => {
      if (otpHandler) {
        otpHandler({ body: { otp: '123456' } }, { send: sinon.stub() })
      }
    })

    await otpPromise

    assert.ok(codeSpy.calledWith(500), 'should set 500 status code')
    assert.ok(
      sendSpy.calledWith('Error loading HTML page'),
      'should send error message'
    )
    assert.strictEqual(
      codeSpy.firstCall.args[0],
      500,
      'should set correct error status code'
    )
    assert.strictEqual(
      sendSpy.firstCall.args[0],
      'Error loading HTML page',
      'should send correct error message'
    )
  })
})
