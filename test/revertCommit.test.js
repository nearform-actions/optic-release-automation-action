'use strict'

const { afterEach, describe, it } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const { mockModule } = require('./mockModule.js')

const setup = () => {
  const execWithOutputStub = sinon.stub()
  const revertCommitProxy = mockModule('../src/utils/revertCommit', {
    '../src/utils/execWithOutput.js': {
      namedExports: {
        execWithOutput: execWithOutputStub,
      },
    },
  })

  return { execWithOutputStub, revertCommitProxy }
}

describe('revertCommit tests', async () => {
  afterEach(() => {
    sinon.restore()
  })

  it('Revert commit', async () => {
    const { revertCommitProxy, execWithOutputStub } = setup()
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
  })
})
