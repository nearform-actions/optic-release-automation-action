'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')

const setup = ({ t }) => {
  const execWithOutputStub = sinon.stub()
  const execMock = t.mock.module('../src/utils/execWithOutput.js', {
    namedExports: {
      execWithOutput: execWithOutputStub,
    },
  })

  const revertCommitProxy = require('../src/utils/revertCommit')
  return { execWithOutputStub, revertCommitProxy, execMock }
}

test('revertCommit tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/utils/revertCommit')]
  })

  t.afterEach(() => {
    sinon.restore()
  })

  await t.test('Revert commit', async t => {
    const { revertCommitProxy, execWithOutputStub, execMock } = setup({ t })
    const baseRef = 'master'
    await revertCommitProxy.revertCommit(baseRef)

    assert.strictEqual(execWithOutputStub.callCount, 2)

    sinon.assert.calledWithExactly(execWithOutputStub, 'git', [
      'revert',
      'HEAD',
    ])
    sinon.assert.calledWithExactly(execWithOutputStub, 'git', [
      'push',
      'origin',
      `${baseRef}`,
    ])
    execMock.restore()
  })
})
