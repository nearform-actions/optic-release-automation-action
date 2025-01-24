'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const sinon = require('sinon')

const setup = ({ t }) => {
  const execWithOutputStub = sinon.stub()
  const execMock = t.mock.module('../src/utils/execWithOutput.js', {
    namedExports: {
      execWithOutput: execWithOutputStub,
    },
  })

  const tagVersionProxy = require('../src/utils/tagVersion')
  return { execWithOutputStub, tagVersionProxy, execMock }
}

test('tagVersion tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/utils/tagVersion')]
  })

  t.afterEach(() => {
    sinon.restore()
  })

  await t.test('Tag version in git', async t => {
    const { tagVersionProxy, execWithOutputStub, execMock } = setup({ t })
    const version = 'v3.0.0'
    await tagVersionProxy.tagVersionInGit(version)

    assert.equal(execWithOutputStub.callCount, 2)

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
    execMock.restore()
  })
})
