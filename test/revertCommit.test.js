'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const runSpawnAction = require('../src/utils/runSpawn')

const setup = () => {
  const runSpawnStub = sinon.stub()
  const utilStub = sinon.stub(runSpawnAction, 'runSpawn').returns(runSpawnStub)
  const revertCommitProxy = proxyquire('../src/utils/revertCommit', {
    './runSpawn': utilStub,
  })

  return { runSpawnStub, revertCommitProxy }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('Revert commit', async t => {
  const { revertCommitProxy, runSpawnStub } = setup()
  const baseRef = 'master'
  await revertCommitProxy.revertCommit(baseRef)

  t.ok(runSpawnStub.callCount === 2)

  sinon.assert.calledWithExactly(runSpawnStub, 'git', ['revert', 'HEAD'])
  sinon.assert.calledWithExactly(runSpawnStub, 'git', [
    'push',
    'origin',
    `${baseRef}`,
  ])
})
