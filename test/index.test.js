'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const actionLog = require('../src/log')
const { PR_TITLE_PREFIX } = require('../src/const')

const buildStubbedAction = ({ t }) => {
  const logStub = sinon.stub(actionLog)
  const releaseStub = sinon.stub().resolves()
  const openPrStub = sinon.stub().resolves()
  const bumpStub = sinon.stub()
  const execWithOutputStub = sinon.stub()
  const coreStub = sinon.stub()
  const conventionalCommitsStub = sinon.stub()

  const logMock = t.mock.module('../src/log.js', {
    defaultExport: logStub,
  })

  const releaseMock = t.mock.module('../src/release.js', {
    defaultExport: releaseStub,
  })

  const openPrMock = t.mock.module('../src/openPr.js', {
    defaultExport: openPrStub,
  })

  const execWithOutputMock = t.mock.module('../src/utils/execWithOutput.js', {
    namedExports: {
      execWithOutput: execWithOutputStub,
    },
  })

  const utilMock = t.mock.module('util', {
    namedExports: {
      promisify: () => bumpStub,
    },
  })

  const conventionalChangelogMock = t.mock.module(
    'conventional-changelog-monorepo/conventional-changelog-conventionalcommits',
    {
      defaultExport: conventionalCommitsStub,
    }
  )

  const conventionalBumpMock = t.mock.module(
    'conventional-changelog-monorepo/conventional-recommended-bump',
    {
      defaultExport: sinon.stub(),
    }
  )

  const coreMock = t.mock.module('@actions/core', {
    namedExports: {
      setFailed: coreStub,
    },
  })

  const { runAction, bumpVersion } = require('../src/index')

  return {
    action: runAction,
    bumpVersion,
    stubs: {
      logStub,
      releaseStub,
      openPrStub,
      bumpStub,
      execWithOutputStub,
      coreStub,
      conventionalCommitsStub,
    },
    mocks: {
      logMock,
      releaseMock,
      openPrMock,
      execWithOutputMock,
      utilMock,
      conventionalChangelogMock,
      conventionalBumpMock,
      coreMock,
    },
  }
}

const DEFAULT_ACTION_DATA = {
  inputs: {},
  packageVersion: '3.1.1',
  context: {
    eventName: 'pull_request',
    repo: {
      repo: {},
      owner: {},
    },
    payload: {
      action: 'closed',
      pull_request: {
        user: { login: 'optic-release-automation[bot]' },
        title: PR_TITLE_PREFIX,
      },
    },
  },
}

test('index tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/index')]
  })

  t.afterEach(() => {
    sinon.restore()
  })

  await t.test(
    'should not run if the event is not workflow_dispatch or pull_request',
    async t => {
      const { action, stubs, mocks } = buildStubbedAction({ t })
      await action({
        ...DEFAULT_ACTION_DATA,
        context: {
          ...DEFAULT_ACTION_DATA.context,
          eventName: 'something_else',
        },
      })

      sinon.assert.calledWithExactly(
        stubs.logStub.logError,
        'Unsupported event'
      )
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    "the release feature should be called if it's a pull request",
    async t => {
      const { action, stubs, mocks } = buildStubbedAction({ t })
      await action({
        ...DEFAULT_ACTION_DATA,
        context: {
          ...DEFAULT_ACTION_DATA.context,
          eventName: 'pull_request',
        },
      })

      sinon.assert.notCalled(stubs.logStub.logError)
      sinon.assert.calledOnce(stubs.releaseStub)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    "the bump feature should be called if it's a workflow_dispatch",
    async t => {
      const { action, stubs, mocks } = buildStubbedAction({ t })
      await action({
        ...DEFAULT_ACTION_DATA,
        context: {
          ...DEFAULT_ACTION_DATA.context,
          eventName: 'workflow_dispatch',
        },
      })

      sinon.assert.notCalled(stubs.logStub.logError)
      sinon.assert.calledOnce(stubs.openPrStub)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'npm should be configured if called with npm-token in inputs',
    async t => {
      const { action, stubs, mocks } = buildStubbedAction({ t })
      await action({
        ...DEFAULT_ACTION_DATA,
        inputs: {
          'npm-token': 'a-token',
        },
        context: {
          ...DEFAULT_ACTION_DATA.context,
          eventName: 'workflow_dispatch',
        },
      })

      sinon.assert.notCalled(stubs.logStub.logError)
      sinon.assert.calledOnce(stubs.openPrStub)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'semver-auto: should call getAutoBumpedVersion if semver is auto',
    async t => {
      const { bumpVersion, stubs, mocks } = buildStubbedAction({ t })

      stubs.bumpStub.resolves({ releaseType: 'major' })
      stubs.execWithOutputStub.onCall(3).resolves('3.0.0')

      const inputs = { semver: 'auto', 'base-tag': 'v1.0.0' }
      const newVersion = await bumpVersion({
        inputs,
      })

      sinon.assert.calledOnce(stubs.bumpStub)
      sinon.assert.callCount(stubs.execWithOutputStub, 4)
      sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'npm', [
        'version',
        '--no-git-tag-version',
        '--preid=',
        'major',
      ])
      assert.strictEqual(newVersion, '3.0.0')
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'semver-auto: should not call getAutoBumpedVersion if semver is not auto',
    async t => {
      const { bumpVersion, stubs, mocks } = buildStubbedAction({ t })

      stubs.execWithOutputStub.onCall(1).resolves('3.1.1')

      const inputs = { semver: 'patch' }
      const newVersion = await bumpVersion({
        inputs,
      })

      sinon.assert.notCalled(stubs.bumpStub)
      sinon.assert.calledTwice(stubs.execWithOutputStub)
      assert.strictEqual(newVersion, '3.1.1')
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test('semver-auto: should bump major if breaking change', async t => {
    const { bumpVersion, stubs, mocks } = buildStubbedAction({ t })

    stubs.bumpStub.resolves({ releaseType: 'major' })
    stubs.execWithOutputStub.onCall(3).resolves('3.0.0')

    const inputs = { semver: 'auto', 'base-tag': 'v1.0.0' }
    const newVersion = await bumpVersion({
      inputs,
    })

    sinon.assert.calledOnce(stubs.bumpStub)
    sinon.assert.callCount(stubs.execWithOutputStub, 4)
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'npm', [
      'version',
      '--no-git-tag-version',
      '--preid=',
      'major',
    ])
    assert.strictEqual(newVersion, '3.0.0')
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test('semver-auto: should bump minor if its a feat', async t => {
    const { bumpVersion, stubs, mocks } = buildStubbedAction({ t })

    stubs.bumpStub.resolves({ releaseType: 'minor' })
    stubs.execWithOutputStub.onCall(3).resolves('3.0.0')

    const inputs = { semver: 'auto', 'base-tag': 'v1.0.0' }
    const newVersion = await bumpVersion({
      inputs,
    })

    sinon.assert.calledOnce(stubs.bumpStub)
    sinon.assert.callCount(stubs.execWithOutputStub, 4)
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'npm', [
      'version',
      '--no-git-tag-version',
      '--preid=',
      'minor',
    ])
    assert.strictEqual(newVersion, '3.0.0')
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test('semver-auto: should bump patch if its a fix', async t => {
    const { bumpVersion, stubs, mocks } = buildStubbedAction({ t })

    stubs.bumpStub.resolves({ releaseType: 'patch' })
    stubs.execWithOutputStub.onCall(3).resolves('3.0.0')

    const inputs = { semver: 'auto', 'base-tag': 'v1.0.0' }
    const newVersion = await bumpVersion({
      inputs,
    })

    sinon.assert.calledOnce(stubs.bumpStub)
    sinon.assert.callCount(stubs.execWithOutputStub, 4)
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'npm', [
      'version',
      '--no-git-tag-version',
      '--preid=',
      'patch',
    ])
    assert.strictEqual(newVersion, '3.0.0')
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test(
    'semver-auto: should use the correct base tag if specified',
    async t => {
      const { bumpVersion, stubs, mocks } = buildStubbedAction({ t })

      stubs.bumpStub.resolves({ releaseType: 'patch' })
      stubs.execWithOutputStub.onCall(3).resolves('3.0.0')

      const inputs = { semver: 'auto', 'base-tag': 'v1.0.0' }
      const newVersion = await bumpVersion({
        inputs,
      })

      sinon.assert.calledOnce(stubs.bumpStub)
      sinon.assert.calledWithExactly(stubs.bumpStub, {
        baseTag: 'v1.0.0',
        config: stubs.conventionalCommitsStub,
      })
      sinon.assert.callCount(stubs.execWithOutputStub, 4)
      sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'npm', [
        'version',
        '--no-git-tag-version',
        '--preid=',
        'patch',
      ])
      assert.strictEqual(newVersion, '3.0.0')
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'semver-auto: should get the latest tag if base tag not provided',
    async t => {
      const { bumpVersion, stubs, mocks } = buildStubbedAction({ t })

      stubs.bumpStub.resolves({ releaseType: 'patch' })
      stubs.execWithOutputStub.onCall(2).resolves('v1.0.0' + '\n' + 'v1.1.1')
      stubs.execWithOutputStub.onCall(4).resolves('3.0.0')

      const inputs = { semver: 'auto' }
      const newVersion = await bumpVersion({
        inputs,
      })

      sinon.assert.calledOnce(stubs.bumpStub)
      sinon.assert.calledWithExactly(stubs.bumpStub, {
        baseTag: 'v1.0.0',
        config: stubs.conventionalCommitsStub,
      })
      sinon.assert.callCount(stubs.execWithOutputStub, 5)
      sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'npm', [
        'version',
        '--no-git-tag-version',
        '--preid=',
        'patch',
      ])
      assert.strictEqual(newVersion, '3.0.0')
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test('semver-auto: should throw if auto bump fails', async t => {
    const { bumpVersion, stubs, mocks } = buildStubbedAction({ t })

    stubs.bumpStub.throws(new Error('bump failed'))
    stubs.execWithOutputStub.onCall(2).resolves('v1.0.0' + '\n' + 'v1.1.1')

    const inputs = { semver: 'auto' }
    try {
      await bumpVersion({
        inputs,
      })
    } catch (error) {
      stubs.coreStub.calledOnceWithExactly('bump failed')
      assert.ok(true)
    }
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test(
    'semver-auto: should default to patch if auto bump fails',
    async t => {
      const { bumpVersion, stubs, mocks } = buildStubbedAction({ t })

      stubs.bumpStub.resolves({})
      stubs.execWithOutputStub.onCall(2).resolves('v1.0.0' + '\n' + 'v1.1.1')
      stubs.execWithOutputStub.onCall(4).resolves('3.0.0')

      const inputs = { semver: 'auto' }
      const newVersion = await bumpVersion({
        inputs,
      })

      sinon.assert.calledOnce(stubs.bumpStub)
      sinon.assert.calledWithExactly(stubs.bumpStub, {
        baseTag: 'v1.0.0',
        config: stubs.conventionalCommitsStub,
      })
      sinon.assert.callCount(stubs.execWithOutputStub, 5)
      sinon.assert.calledWithExactly(
        stubs.execWithOutputStub.getCall(3),
        'npm',
        ['version', '--no-git-tag-version', '--preid=', 'patch']
      )
      assert.deepStrictEqual(newVersion, '3.0.0')
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )
})
