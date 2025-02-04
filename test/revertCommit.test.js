'use strict'

const { describe, it, mock } = require('node:test')
const assert = require('node:assert/strict')
const { mockModule } = require('./mockModule.js')

const setup = () => {
  const execWithOutputStub = mock.fn()
  const revertCommitProxy = mockModule('../src/utils/revertCommit.js', {
    '../src/utils/execWithOutput.js': {
      namedExports: {
        execWithOutput: execWithOutputStub,
      },
    },
  })

  return { execWithOutputStub, revertCommitProxy }
}

describe('revertCommit tests', async () => {
  it('Revert commit', async () => {
    const { revertCommitProxy, execWithOutputStub } = setup()
    const baseRef = 'master'
    await revertCommitProxy.revertCommit(baseRef)

    assert.strictEqual(execWithOutputStub.mock.calls.length, 2)

    assert.deepStrictEqual(execWithOutputStub.mock.calls[0].arguments, [
      'git',
      ['revert', 'HEAD'],
    ])
    assert.deepStrictEqual(execWithOutputStub.mock.calls[1].arguments, [
      'git',
      ['push', 'origin', baseRef],
    ])
  })
})
