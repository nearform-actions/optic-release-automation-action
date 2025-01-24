'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const sinon = require('sinon')

const setup = ({ t }) => {
  const logInfoStub = sinon.stub()
  const logErrorStub = sinon.stub()

  const mockApp = {
    get: sinon.stub(),
    post: sinon.stub(),
    register: sinon.stub(),
    listen: sinon.stub().resolves(),
    close: sinon.stub().resolves(),
  }

  const fastifyStub = sinon.stub().returns(mockApp)

  const fastifyMock = t.mock.module('fastify', {
    defaultExport: fastifyStub,
  })

  const logMock = t.mock.module('../src/log.js', {
    namedExports: {
      logInfo: logInfoStub,
      logError: logErrorStub,
    },
  })

  const ngrokMock = t.mock.module('../src/utils/getNgrok.js', {
    defaultExport: async () => ({
      connect: sinon.stub().resolves('https://test.ngrok.io'),
      kill: sinon.stub().resolves(),
    }),
  })

  const ngrokOtpVerificationProxy = require('../src/utils/ngrokOtpVerification')

  return {
    logInfoStub,
    logErrorStub,
    mockApp,
    ngrokOtpVerificationProxy,
    mocks: { fastifyMock, logMock, ngrokMock },
  }
}

test('ngrok otp tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/utils/ngrokOtpVerification')]
  })

  t.afterEach(() => {
    sinon.restore()
  })

  await t.test('Should successfully verify OTP', async t => {
    const { ngrokOtpVerificationProxy, mockApp, mocks } = setup({ t })

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
    assert.equal(otp, '123456', 'should return submitted OTP')
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test('Should timeout after 5 minutes', async t => {
    const { ngrokOtpVerificationProxy, logErrorStub, mocks } = setup({ t })

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
      Object.values(mocks).forEach(mock => mock.restore())
    }
  })

  await t.test('Should handle HTML template rendering', async t => {
    const { ngrokOtpVerificationProxy, mockApp, mocks } = setup({ t })

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
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test(
    'Should handle the failure case when fastify app or html fails to load',
    async t => {
      const { ngrokOtpVerificationProxy, mockApp, mocks } = setup({ t })

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
      assert.equal(
        codeSpy.firstCall.args[0],
        500,
        'should set correct error status code'
      )
      assert.equal(
        sendSpy.firstCall.args[0],
        'Error loading HTML page',
        'should send correct error message'
      )
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )
})
