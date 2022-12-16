'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')

const setup = () => {
  const execWithOutputStub = sinon.stub()
  execWithOutputStub
    .withArgs('curl', [
      '-s',
      'https://optic-test.run.app/api/generate/optic-token',
    ])
    .returns('otp123')
  execWithOutputStub
    .withArgs('npm', ['view', '--json'])
    .returns('{"name":"fakeTestPkg"}')

  // npm behavior < v8.13.0
  execWithOutputStub.withArgs('npm', ['view', 'fakeTestPkg@v5.1.3']).returns('')

  const publishToNpmProxy = proxyquire('../src/utils/publishToNpm', {
    './execWithOutput': { execWithOutput: execWithOutputStub },
  })

  return { execWithOutputStub, publishToNpmProxy }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('Should publish to npm with optic', async t => {
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
  t.pass('npm config')

  // We skip calls in these checks:
  // - 1 used to get the package name
  // - 2 used to check if the package version is already published
  sinon.assert.calledWithExactly(execWithOutputStub.getCall(3), 'npm', [
    'pack',
    '--dry-run',
  ])
  t.pass('npm pack called')

  sinon.assert.calledWithExactly(execWithOutputStub.getCall(4), 'curl', [
    '-s',
    'https://optic-test.run.app/api/generate/optic-token',
  ])
  t.pass('curl called')

  sinon.assert.calledWithExactly(execWithOutputStub.getCall(5), 'npm', [
    'publish',
    '--otp',
    'otp123',
    '--tag',
    'latest',
  ])
  t.pass('npm publish called')
})

tap.test(
  "Should publish to npm when package hasn't been published before",
  async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup()

    execWithOutputStub.withArgs('npm', ['view', '--json']).resolves('')

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
  }
)

tap.test('Should publish to npm without optic', async () => {
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
  sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
    'publish',
    '--tag',
    'latest',
  ])
})

tap.test(
  'Should skip npm package publication when it was already published',
  async () => {
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
    sinon.assert.neverCalledWith(execWithOutputStub, 'npm', [
      'publish',
      '--tag',
      'latest',
    ])
  }
)

tap.test('Should stop action if package info retrieval fails', async t => {
  t.plan(3)
  const { publishToNpmProxy, execWithOutputStub } = setup()

  execWithOutputStub
    .withArgs('npm', ['view', '--json'])
    .throws(new Error('Network Error'))

  try {
    await publishToNpmProxy.publishToNpm({
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      version: 'v5.1.3',
    })
  } catch (e) {
    t.equal(e.message, 'Network Error')
  }

  sinon.assert.neverCalledWith(execWithOutputStub, 'npm', [
    'publish',
    '--otp',
    'otp123',
    '--tag',
    'latest',
  ])
  t.pass('package is not published with otp code')

  sinon.assert.neverCalledWith(execWithOutputStub, 'npm', [
    'publish',
    '--tag',
    'latest',
  ])
  t.pass('package is not published without otp code')
})

tap.test(
  'Should stop action if package version info retrieval fails',
  async t => {
    t.plan(3)
    const { publishToNpmProxy, execWithOutputStub } = setup()

    execWithOutputStub
      .withArgs('npm', ['view', 'fakeTestPkg@v5.1.3'])
      .throws(new Error('Network Error'))

    try {
      await publishToNpmProxy.publishToNpm({
        npmToken: 'a-token',
        opticUrl: 'https://optic-test.run.app/api/generate/',
        npmTag: 'latest',
        version: 'v5.1.3',
      })
    } catch (e) {
      t.equal(e.message, 'Network Error')
    }

    sinon.assert.neverCalledWith(execWithOutputStub, 'npm', [
      'publish',
      '--otp',
      'otp123',
      '--tag',
      'latest',
    ])
    t.pass('package is not published with otp code')

    sinon.assert.neverCalledWith(execWithOutputStub, 'npm', [
      'publish',
      '--tag',
      'latest',
    ])
    t.pass('package is not published without otp code')
  }
)

tap.test(
  'Should continue action if package info returns not found',
  async () => {
    const { publishToNpmProxy, execWithOutputStub } = setup()

    execWithOutputStub
      .withArgs('npm', ['view', '--json'])
      .throws(new Error('code E404'))

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
  }
)

tap.test(
  'Should continue action if package version info returns not found',
  async () => {
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
  }
)
