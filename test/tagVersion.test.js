'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const runSpawnAction = require('../utils/runSpawn')

const setup = () => {
  const runSpawnStub = sinon.stub()
  const utilStub = sinon.stub(runSpawnAction, 'runSpawn').returns(runSpawnStub)
  const tagVersionProxy = proxyquire('../utils/tagVersion', {
    './runSpawn': utilStub,
  })

  return { runSpawnStub, tagVersionProxy }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('Tag version in git', async t => {
  const { tagVersionProxy, runSpawnStub } = setup()
  const version = 'v3.0.0'
  await tagVersionProxy.tagVersionInGit(version)

  t.ok(runSpawnStub.callCount === 3)

  sinon.assert.calledWithExactly(runSpawnStub, 'git', [
    'push',
    'origin',
    `:refs/tags/${version}`,
  ])
  sinon.assert.calledWithExactly(runSpawnStub, 'git', [
    'tag',
    '-f',
    `"${version}"`,
  ])
  sinon.assert.calledWithExactly(runSpawnStub, 'git', [
    'push',
    'origin',
    `--tags`,
  ])
})
