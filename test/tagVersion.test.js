'use strict'

const { describe, it, mock } = require('node:test')
const assert = require('node:assert/strict')
const { mockModule } = require('./mockModule.js')
const setup = () => {
  const execWithOutputStub = mock.fn()
  const tagVersionProxy = mockModule('../src/utils/tagVersion', {
    '../src/utils/execWithOutput.js': {
      namedExports: {
        execWithOutput: execWithOutputStub,
      },
    },
  })

  return { execWithOutputStub, tagVersionProxy }
}

describe('tagVersion tests', async () => {
  it('Tag version in git', async () => {
    const { tagVersionProxy, execWithOutputStub } = setup()
    const version = 'v3.0.0'
    await tagVersionProxy.tagVersionInGit(version)

    assert.strictEqual(execWithOutputStub.mock.calls.length, 2)

    assert.deepStrictEqual(execWithOutputStub.mock.calls[0].arguments, [
      'git',
      ['tag', '-f', version],
    ])
    assert.deepStrictEqual(execWithOutputStub.mock.calls[1].arguments, [
      'git',
      ['push', 'origin', '-f', version],
    ])
  })
})
