'use strict'

const { afterEach, describe, it } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const { mockModule } = require('./mockModule.js')

const setup = ({
  packageName = 'fakeTestPkg',
  published = true,
  mockPackageInfo,
  otpFlow = 'optic',
} = {}) => {
  const execWithOutputStub = sinon.stub()
  const otpVerificationStub = sinon.stub().resolves('ngrok123')
  // npm behavior < v8.13.0
  execWithOutputStub
    .withArgs('npm', ['view', `${packageName}@v5.1.3`])
    .returns('')

  const getLocalInfo = () => ({ name: packageName })
  const getPublishedInfo = async () =>
    published ? { name: packageName } : null

  // Conditional setup based on otpFlow
  let proxyConfig = {
    '../src/utils/packageInfo.js': mockPackageInfo
      ? mockPackageInfo({ execWithOutputStub, getLocalInfo, getPublishedInfo })
      : {
          namedExports: {
            getLocalInfo,
            getPublishedInfo,
          },
        },
  }
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
    proxyConfig['../src/utils/execWithOutput.js'] = {
      namedExports: {
        execWithOutput: execWithOutputStub,
      },
    }
  } else if (otpFlow === 'ngrok') {
    proxyConfig = {
      ...proxyConfig,
      '../src/utils/execWithOutput.js': {
        namedExports: {
          execWithOutput: execWithOutputStub,
        },
      },
      '../src/utils/ngrokOtpVerification.js': {
        defaultExport: otpVerificationStub,
      },
    }
  }

  const publishToNpmProxy = mockModule(
    '../src/utils/publishToNpm.js',
    proxyConfig
  )

  return {
    execWithOutputStub,
    publishToNpmProxy,
    otpVerificationStub,
  }
}

describe('publishToNpm tests', async () => {
  afterEach(() => {
    sinon.restore()
  })

  it('Should publish to npm with optic', async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup()

    await publishToNpmProxy.publishToNpm({
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
  })

  it("Should publish to npm when package hasn't been published before", async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup({
      published: false,
    })

    await publishToNpmProxy.publishToNpm({
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
  })

  it('Should publish to npm without optic', async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup()

    await publishToNpmProxy.publishToNpm({
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
  })

  it('Should skip npm package publication when it was already published', async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup()

    execWithOutputStub
      .withArgs('npm', ['view', 'fakeTestPkg@v5.1.3'])
      .returns('fake package data that says it was published')

    await publishToNpmProxy.publishToNpm({
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
  })

  it('Should stop action if package info retrieval fails', async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup({
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
      publishToNpmProxy.publishToNpm({
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
  })

  it('Should stop action if package version info retrieval fails', async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup()

    execWithOutputStub
      .withArgs('npm', ['view', 'fakeTestPkg@v5.1.3'])
      .throws(new Error('Network Error'))

    await assert.rejects(
      publishToNpmProxy.publishToNpm({
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
  })

  it('Should continue action if package info returns not found', async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup({
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

    await publishToNpmProxy.publishToNpm({
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
  })

  it('Should continue action if package version info returns not found', async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup()

    execWithOutputStub
      .withArgs('npm', ['view', 'fakeTestPkg@v5.1.3'])
      .throws(new Error('code E404'))

    await publishToNpmProxy.publishToNpm({
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
  })

  it('Adds --provenance flag when provenance option provided', async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup()

    await publishToNpmProxy.publishToNpm({
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
  })

  it('Adds --access flag if provided as an input', async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup()

    await publishToNpmProxy.publishToNpm({
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
  })

  it('Should publish using ngrok for OTP verification', async () => {
    const { publishToNpmProxy, execWithOutputStub, otpVerificationStub } =
      setup({ otpFlow: 'ngrok' })

    await publishToNpmProxy.publishToNpm({
      npmToken: 'a-token',
      ngrokToken: 'ngrok-token',
      npmTag: 'latest',
      version: 'v5.1.3',
    })

    const ctrl = new AbortController()
    sinon.assert.calledWithExactly(
      otpVerificationStub,
      { version: 'v5.1.3', name: 'fakeTestPkg' },
      'ngrok-token',
      ctrl.signal
    )

    sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
      'publish',
      '--otp',
      'ngrok123',
      '--tag',
      'latest',
    ])
  })

  it('Should fail gracefully when ngrok services fail', async () => {
    const { publishToNpmProxy, otpVerificationStub } = setup({
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
      publishToNpmProxy.publishToNpm({
        npmToken: 'a-token',
        ngrokToken: 'ngrok-token',
        npmTag: 'latest',
        version: 'v5.1.3',
      }),
      { message: 'OTP verification failed: Ngrok failed' }
    )
  })

  it('Should fail gracefully when fail to receive otp from optic', async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup({
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
      publishToNpmProxy.publishToNpm({
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
  })
})
