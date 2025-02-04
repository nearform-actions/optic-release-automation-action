'use strict'

const { afterEach, describe, it } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const { mockModule } = require('./mockModule.js')
const setup = () => {
  const execWithOutputStub = sinon.stub()
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
  afterEach(() => {
    sinon.restore()
  })

  it('Tag version in git', async () => {
    const { tagVersionProxy, execWithOutputStub } = setup()
    const version = 'v3.0.0'
    await tagVersionProxy.tagVersionInGit(version)

    assert.strictEqual(execWithOutputStub.callCount, 2)

    sinon.assert.calledWithExactly(execWithOutputStub, 'git', [
      'tag',
      '-f',
      `${version}`,
    ])
    sinon.assert.calledWithExactly(execWithOutputStub, 'git', [
      'push',
      'origin',
      '-f',
      `v3.0.0`,
    ])
  })
})
