'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const runSpawnAction = require('../src/utils/runSpawn')

const setup = () => {
  const runSpawnStub = sinon.stub().returns('otp123')
  const utilStub = sinon.stub(runSpawnAction, 'runSpawn').returns(runSpawnStub)
  const publishToNpmProxy = proxyquire('../src/utils/publishToNpm', {
    './runSpawn': utilStub,
  })

  return { runSpawnStub, publishToNpmProxy }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('Should publish to npm with optic', async t => {
  const { publishToNpmProxy, runSpawnStub } = setup()
  await publishToNpmProxy.publishToNpm({
    npmToken: 'a-token',
    opticToken: 'optic-token',
    opticUrl: 'https://optic-test.run.app/api/generate/',
    npmTag: 'latest',
  })

  sinon.assert.calledWithExactly(runSpawnStub.getCall(0), 'npm', [
    'config',
    'set',
    '//registry.npmjs.org/:_authToken=a-token',
  ])
  t.pass('npm config')

  sinon.assert.calledWithExactly(runSpawnStub.getCall(1), 'npm', [
    'pack',
    '--dry-run',
  ])
  t.pass('npm pack called')

  sinon.assert.calledWithExactly(runSpawnStub.getCall(2), 'curl', [
    '-s',
    'https://optic-test.run.app/api/generate/optic-token',
  ])
  t.pass('curl called')

  sinon.assert.calledWithExactly(runSpawnStub.getCall(3), 'npm', [
    'publish',
    '--otp',
    'otp123',
    '--tag',
    'latest',
  ])
  t.pass('npm publish called')
})

tap.test('Should publish to npm without optic', async () => {
  const { publishToNpmProxy, runSpawnStub } = setup()
  await publishToNpmProxy.publishToNpm({
    npmToken: 'a-token',
    opticUrl: 'https://optic-test.run.app/api/generate/',
    npmTag: 'latest',
  })

  sinon.assert.calledWithExactly(runSpawnStub, 'npm', ['pack', '--dry-run'])
  sinon.assert.calledWithExactly(runSpawnStub, 'npm', [
    'publish',
    '--tag',
    'latest',
  ])
})
