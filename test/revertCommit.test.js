'use strict'

const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')

const setup = () => {
  const execWithOutputStub = sinon.stub()
  const revertCommitProxy = proxyquire('../src/utils/revertCommit', {
    './execWithOutput': { execWithOutput: () => execWithOutputStub },
  })

  return { execWithOutputStub, revertCommitProxy }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('Revert commit', async t => {
  const { revertCommitProxy, execWithOutputStub } = setup()
  const baseRef = 'master'
  await revertCommitProxy.revertCommit(baseRef)

  t.ok(execWithOutputStub.callCount === 2)

  sinon.assert.calledWithExactly(execWithOutputStub, 'git', ['revert', 'HEAD'])
  sinon.assert.calledWithExactly(execWithOutputStub, 'git', [
    'push',
    'origin',
    `${baseRef}`,
  ])
})
