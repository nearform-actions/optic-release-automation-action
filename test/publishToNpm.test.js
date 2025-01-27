'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const sinon = require('sinon')

const setup = ({
  t,
  packageName = 'fakeTestPkg',
  published = true,
  mockPackageInfo,
  otpFlow = 'optic',
} = {}) => {
  const execWithOutputStub = sinon.stub()

  execWithOutputStub
    .withArgs('npm', ['view', `${packageName}@v5.1.3`])
    .returns('')

  const getLocalInfo = () => ({ name: packageName })
  const getPublishedInfo = async () =>
    published ? { name: packageName } : null

  let mocks = {}
  let proxyConfig = {
    namedExports: {
      getLocalInfo,
      getPublishedInfo,
    },
  }

  if (mockPackageInfo) {
    proxyConfig = mockPackageInfo({
      execWithOutputStub,
      getLocalInfo,
      getPublishedInfo,
    })
  }

  const packageInfoMock = t.mock.module(
    '../src/utils/packageInfo.js',
    proxyConfig
  )
  mocks.packageInfoMock = packageInfoMock
  let otpVerificationStub = sinon.stub().resolves('ngrok123')
  if (otpFlow === 'optic') {
    execWithOutputStub
      .withArgs('curl', [
        '-s',
        '-d',
        JSON.stringify({
          packageInfo: { version: 'v5.1.3', name: 'fakeTestPkg' },
        }),
        '-H',
        'Content-Type: application/json',
        '-X',
        'POST',
        'https://optic-test.run.app/api/generate/optic-token',
      ])
      .returns('otp123')

    const execMock = t.mock.module('../src/utils/execWithOutput.js', {
      namedExports: {
        execWithOutput: execWithOutputStub,
      },
    })
    mocks.execMock = execMock
  } else if (otpFlow === 'ngrok') {
    const execMock = t.mock.module('../src/utils/execWithOutput.js', {
      namedExports: {
        execWithOutput: execWithOutputStub,
      },
    })

    const ngrokMock = t.mock.module('../src/utils/ngrokOtpVerification.js', {
      defaultExport: otpVerificationStub,
    })

    mocks.execMock = execMock
    mocks.ngrokMock = ngrokMock
  }

  const publishToNpm = require('../src/utils/publishToNpm')
  return {
    execWithOutputStub,
    publishToNpm,
    otpVerificationStub,
    mocks,
  }
}

test('publishToNpm tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/utils/publishToNpm')]
  })

  t.afterEach(() => {
    sinon.restore()
  })

  await t.test('Should publish to npm with optic', async t => {
    const { publishToNpm, execWithOutputStub, mocks } = setup({ t })

    await publishToNpm.publishToNpm({
      npmToken: 'a-token',
      opticToken: 'optic-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      version: 'v5.1.3',
    })

    sinon.assert.calledWithExactly(execWithOutputStub.getCall(0), 'npm', [
      'config',
      'set',
      '//registry.npmjs.org/:_authToken=a-token',
    ])

    sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
      'pack',
      '--dry-run',
    ])

    sinon.assert.calledWithExactly(execWithOutputStub, 'curl', [
      '-s',
      '-d',
      JSON.stringify({
        packageInfo: { version: 'v5.1.3', name: 'fakeTestPkg' },
      }),
      '-H',
      'Content-Type: application/json',
      '-X',
      'POST',
      'https://optic-test.run.app/api/generate/optic-token',
    ])

    sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
      'publish',
      '--otp',
      'otp123',
      '--tag',
      'latest',
    ])
    assert.ok(true, 'npm pack called')
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test(
    "Should publish to npm when package hasn't been published before",
    async t => {
      const { publishToNpm, execWithOutputStub, mocks } = setup({
        t,
        published: false,
      })

      await publishToNpm.publishToNpm({
        npmToken: 'a-token',
        opticUrl: 'https://optic-test.run.app/api/generate/',
        npmTag: 'latest',
        version: 'v5.1.3',
      })

      sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
        'pack',
        '--dry-run',
      ])
      assert.ok(true, 'npm pack called')
      sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
        'publish',
        '--tag',
        'latest',
      ])
      assert.ok(true, 'npm publish called')
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test('Should publish to npm without optic', async t => {
    const { publishToNpm, execWithOutputStub, mocks } = setup({ t })

    await publishToNpm.publishToNpm({
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      version: 'v5.1.3',
    })

    sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
      'pack',
      '--dry-run',
    ])
    assert.ok(true, 'npm pack called')
    sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
      'publish',
      '--tag',
      'latest',
    ])
    assert.ok(true, 'npm publish called')
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test(
    'Should skip npm package publication when it was already published',
    async t => {
      const { publishToNpm, execWithOutputStub, mocks } = setup({ t })

      execWithOutputStub
        .withArgs('npm', ['view', 'fakeTestPkg@v5.1.3'])
        .returns('fake package data that says it was published')

      await publishToNpm.publishToNpm({
        npmToken: 'a-token',
        opticUrl: 'https://optic-test.run.app/api/generate/',
        npmTag: 'latest',
        version: 'v5.1.3',
      })

      sinon.assert.neverCalledWith(execWithOutputStub, 'npm', [
        'publish',
        '--otp',
        'otp123',
        '--tag',
        'latest',
      ])
      assert.ok(true, 'publish never called with otp')
      sinon.assert.neverCalledWith(execWithOutputStub, 'npm', [
        'publish',
        '--tag',
        'latest',
      ])
      assert.ok(true, 'publish never called')
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'Should stop action if package info retrieval fails',
    async t => {
      const { publishToNpm, execWithOutputStub, mocks } = setup({
        t,
        mockPackageInfo: ({ getLocalInfo }) => ({
          namedExports: {
            getLocalInfo,
            getPublishedInfo: async () => {
              throw new Error('Network Error')
            },
          },
        }),
      })

      await assert.rejects(
        publishToNpm.publishToNpm({
          npmToken: 'a-token',
          opticUrl: 'https://optic-test.run.app/api/generate/',
          npmTag: 'latest',
          version: 'v5.1.3',
        }),
        /Network Error/
      )

      sinon.assert.neverCalledWith(execWithOutputStub, 'npm', [
        'publish',
        '--otp',
        'otp123',
        '--tag',
        'latest',
      ])
      assert.ok(true, 'package is not published with otp code')
      sinon.assert.neverCalledWith(execWithOutputStub, 'npm', [
        'publish',
        '--tag',
        'latest',
      ])
      assert.ok(true, 'package is not published without otp code')
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'Should stop action if package version info retrieval fails',
    async t => {
      const { publishToNpm, execWithOutputStub, mocks } = setup({ t })

      execWithOutputStub
        .withArgs('npm', ['view', 'fakeTestPkg@v5.1.3'])
        .throws(new Error('Network Error'))

      await assert.rejects(
        publishToNpm.publishToNpm({
          npmToken: 'a-token',
          opticUrl: 'https://optic-test.run.app/api/generate/',
          npmTag: 'latest',
          version: 'v5.1.3',
        }),
        /Network Error/
      )

      sinon.assert.neverCalledWith(execWithOutputStub, 'npm', [
        'publish',
        '--otp',
        'otp123',
        '--tag',
        'latest',
      ])
      assert.ok(true, 'package is not published with otp code')
      sinon.assert.neverCalledWith(execWithOutputStub, 'npm', [
        'publish',
        '--tag',
        'latest',
      ])
      assert.ok(true, 'package is not published without otp code')

      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'Should continue action if package info returns not found',
    async t => {
      const { publishToNpm, execWithOutputStub, mocks } = setup({
        t,
        mockPackageInfo: ({ getLocalInfo }) => ({
          namedExports: {
            getLocalInfo,
            getPublishedInfo: async () => new Error('code E404'),
          },
        }),
      })

      execWithOutputStub
        .withArgs('npm', ['view', 'fakeTestPkg@v5.1.3'])
        .returns('')

      await publishToNpm.publishToNpm({
        npmToken: 'a-token',
        opticUrl: 'https://optic-test.run.app/api/generate/',
        npmTag: 'latest',
        version: 'v5.1.3',
      })

      sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
        'pack',
        '--dry-run',
      ])
      sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
        'publish',
        '--tag',
        'latest',
      ])

      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'Should continue action if package version info returns not found',
    async t => {
      const { publishToNpm, execWithOutputStub, mocks } = setup({ t })

      execWithOutputStub
        .withArgs('npm', ['view', 'fakeTestPkg@v5.1.3'])
        .throws(new Error('code E404'))

      await publishToNpm.publishToNpm({
        npmToken: 'a-token',
        opticUrl: 'https://optic-test.run.app/api/generate/',
        npmTag: 'latest',
        version: 'v5.1.3',
      })

      sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
        'pack',
        '--dry-run',
      ])
      sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
        'publish',
        '--tag',
        'latest',
      ])

      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'Adds --provenance flag when provenance option provided',
    async t => {
      const { publishToNpm, execWithOutputStub, mocks } = setup({ t })

      await publishToNpm.publishToNpm({
        npmToken: 'a-token',
        opticUrl: 'https://optic-test.run.app/api/generate/',
        npmTag: 'latest',
        version: 'v5.1.3',
        provenance: true,
      })

      sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
        'publish',
        '--tag',
        'latest',
        '--provenance',
      ])

      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test('Adds --access flag if provided as an input', async t => {
    const { publishToNpm, execWithOutputStub, mocks } = setup({ t })

    await publishToNpm.publishToNpm({
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      version: 'v5.1.3',
      access: 'public',
    })

    sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
      'publish',
      '--tag',
      'latest',
      '--access',
      'public',
    ])

    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test('Should publish using ngrok for OTP verification', async t => {
    const { publishToNpm, execWithOutputStub, otpVerificationStub, mocks } =
      setup({
        t,
        otpFlow: 'ngrok',
      })

    await publishToNpm.publishToNpm({
      npmToken: 'a-token',
      ngrokToken: 'ngrok-token',
      npmTag: 'latest',
      version: 'v5.1.3',
    })

    sinon.assert.calledWithExactly(
      otpVerificationStub,
      { version: 'v5.1.3', name: 'fakeTestPkg' },
      'ngrok-token'
    )

    sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
      'publish',
      '--otp',
      'ngrok123',
      '--tag',
      'latest',
    ])

    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test('Should fail gracefully when ngrok services fail', async t => {
    const { publishToNpm, otpVerificationStub, mocks } = setup({
      t,
      mockPackageInfo: ({ getLocalInfo }) => ({
        namedExports: {
          getLocalInfo,
          getPublishedInfo: async () =>
            new Error('OTP verification failed: Ngrok failed'),
        },
      }),
      otpFlow: 'ngrok',
    })

    otpVerificationStub.throws(new Error('Ngrok failed'))

    await assert.rejects(
      publishToNpm.publishToNpm({
        npmToken: 'a-token',
        ngrokToken: 'ngrok-token',
        npmTag: 'latest',
        version: 'v5.1.3',
      }),
      { message: 'OTP verification failed: Ngrok failed' }
    )

    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test(
    'Should fail gracefully when fail to receive otp from optic',
    async t => {
      const { publishToNpm, execWithOutputStub, mocks } = setup({
        t,
        otpFlow: 'optic',
      })

      execWithOutputStub
        .withArgs('curl', [
          '-s',
          '-d',
          JSON.stringify({
            packageInfo: { version: 'v5.1.3', name: 'fakeTestPkg' },
          }),
          '-H',
          'Content-Type: application/json',
          '-X',
          'POST',
          'https://optic-test.run.app/api/generate/optic-token',
        ])
        .throws(new Error('Optic failed'))

      await assert.rejects(
        publishToNpm.publishToNpm({
          npmToken: 'a-token',
          opticToken: 'optic-token',
          opticUrl: 'https://optic-test.run.app/api/generate/',
          npmTag: 'latest',
          version: 'v5.1.3',
        }),
        {
          message: 'OTP verification failed: Optic failed',
        }
      )

      Object.values(mocks).forEach(mock => mock.restore())
    }
  )
})
