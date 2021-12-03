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
  t.ok(
    runSpawnStub.calledWith('git', ['push', 'origin', `:refs/tags/${version}`])
  )
  t.ok(runSpawnStub.calledWith('git', ['tag', '-f', `"${version}"`]))
  t.ok(runSpawnStub.calledWith('git', ['push', 'origin', `--tags`]))
})
