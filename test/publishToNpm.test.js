'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')

const setup = ({ packageName =  'fakeTestPkg', published = true, mockPackageInfo } = {}) => {
  const execWithOutputStub = sinon.stub()
  execWithOutputStub
    .withArgs('curl', [
      '-s',
      'https://optic-test.run.app/api/generate/optic-token',
    ])
    .returns('otp123')

  // npm behavior < v8.13.0
  execWithOutputStub.withArgs('npm', ['view', `${packageName}@v5.1.3`]).returns('')

  const getLocalInfo = () => ({ name: packageName })
  const getPublishedInfo = async () => published ? { name: packageName } : null

  const publishToNpmProxy = proxyquire('../src/utils/publishToNpm', {
    './execWithOutput': { execWithOutput: execWithOutputStub },
    './packageInfo': mockPackageInfo ? mockPackageInfo({ execWithOutputStub, getLocalInfo, getPublishedInfo}) : {
      getLocalInfo,
      getPublishedInfo,
    }
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

  sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
    'pack',
    '--dry-run',
  ])
  t.pass('npm pack called')

  sinon.assert.calledWithExactly(execWithOutputStub, 'curl', [
    '-s',
    'https://optic-test.run.app/api/generate/optic-token',
  ])
  t.pass('curl called')

  sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
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
  async t => {
    const { publishToNpmProxy, execWithOutputStub } = setup({ published: false })

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
    t.pass('npm pack called')

    sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
      'publish',
      '--tag',
      'latest',
    ])
    t.pass('npm publish called')
  }
)

tap.test('Should publish to npm without optic', async t => {
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
  t.pass('npm pack called')

  sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
    'publish',
    '--tag',
    'latest',
  ])
  t.pass('npm publish called')
})

tap.test(
  'Should skip npm package publication when it was already published',
  async t => {
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
    t.pass('publish never called with otp')

    sinon.assert.neverCalledWith(execWithOutputStub, 'npm', [
      'publish',
      '--tag',
      'latest',
    ])
    t.pass('publish never called')
  }
)

tap.test('Should stop action if package info retrieval fails', async t => {
  t.plan(3)
  const { publishToNpmProxy, execWithOutputStub } = setup({
    // Use original getPublishedInfo logic with execWithOutputStub injected into it
    mockPackageInfo: ({ getLocalInfo, execWithOutputStub }) => ({
      getLocalInfo,
      getPublishedInfo: proxyquire('../src/utils/packageInfo', {
        './execWithOutput': { execWithOutput: execWithOutputStub }
      }).getPublishedInfo
    })
  })
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
  async t => {
    const { publishToNpmProxy, execWithOutputStub } = setup({
      // Use original getPublishedInfo logic with execWithOutputStub injected into it
      mockPackageInfo: ({ getLocalInfo, execWithOutputStub }) => ({
        getLocalInfo,
        getPublishedInfo: proxyquire('../src/utils/packageInfo', {
          './execWithOutput': { execWithOutput: execWithOutputStub }
        }).getPublishedInfo
      })
    })

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
    t.pass('npm pack called')

    sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
      'publish',
      '--tag',
      'latest',
    ])
    t.pass('npm publish called')
  }
)

tap.test(
  'Should continue action if package version info returns not found',
  async t => {
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
    t.pass('npm pack called')

    sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
      'publish',
      '--tag',
      'latest',
    ])
    t.pass('npm publish called')
  }
)

tap.test('Adds --provenance flag when provenance option provided', async t => {
  const { publishToNpmProxy, execWithOutputStub } = setup()
  await publishToNpmProxy.publishToNpm({
    npmToken: 'a-token',
    opticUrl: 'https://optic-test.run.app/api/generate/',
    npmTag: 'latest',
    version: 'v5.1.3',
    provenance: true,
  })

  t.doesNotThrow(
    () => sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
      'publish',
      '--tag',
      'latest',
      '--provenance',
    ])
  )
})

tap.test('Adds --access flag if provided as an input', async t => {
  const { publishToNpmProxy, execWithOutputStub } = setup()
  await publishToNpmProxy.publishToNpm({
    npmToken: 'a-token',
    opticUrl: 'https://optic-test.run.app/api/generate/',
    npmTag: 'latest',
    version: 'v5.1.3',
    access: 'public',
  })

  t.doesNotThrow(
    () => sinon.assert.calledWithExactly(execWithOutputStub, 'npm', [
      'publish',
      '--tag',
      'latest',
      '--access',
      'public',
    ])
  )
})
