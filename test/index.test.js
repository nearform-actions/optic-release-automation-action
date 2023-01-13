'use strict'

const tap = require('tap')
const proxyquire = require('proxyquire').noCallThru()
const sinon = require('sinon')

const actionLog = require('../src/log')

const { PR_TITLE_PREFIX } = require('../src/const')

function buildStubbedAction() {
  const logStub = sinon.stub(actionLog)
  const releaseStub = sinon.stub()
  const openPrStub = sinon.stub()
  const bumpStub = sinon.stub()
  const execWithOutputStub = sinon.stub()
  const coreStub = sinon.stub()
  const conventionalcommitsStub = sinon.stub()

  const { runAction, bumpVersion } = proxyquire('../src/index', {
    './log': logStub,
    './release': releaseStub.resolves(),
    './openPr': openPrStub.resolves(),
    './utils/execWithOutput': {
      execWithOutput: execWithOutputStub,
    },
    util: {
      promisify: () => bumpStub,
    },
    'conventional-changelog-monorepo/conventional-changelog-conventionalcommits':
      conventionalcommitsStub,
    'conventional-changelog-monorepo/conventional-recommended-bump':
      sinon.stub(),
    '@actions/core': {
      setFailed: coreStub,
    },
  })

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
      conventionalcommitsStub,
    },
  }
}

tap.afterEach(() => {
  sinon.restore()
})

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

tap.test(
  'should not run if the event is not workflow_dispatch or pull_request',
  async () => {
    const { action, stubs } = buildStubbedAction()
    await action({
      ...DEFAULT_ACTION_DATA,
      context: {
        ...DEFAULT_ACTION_DATA.context,
        eventName: 'something_else',
      },
    })

    sinon.assert.calledWithExactly(stubs.logStub.logError, 'Unsupported event')
  }
)

tap.test(
  "the release feature should be called if it's a pull request",
  async () => {
    const { action, stubs } = buildStubbedAction()
    await action({
      ...DEFAULT_ACTION_DATA,
      context: {
        ...DEFAULT_ACTION_DATA.context,
        eventName: 'pull_request',
      },
    })

    sinon.assert.notCalled(stubs.logStub.logError)
    sinon.assert.calledOnce(stubs.releaseStub)
  }
)

tap.test(
  "the bump feature should be called if it's a workflow_dispatch",
  async () => {
    const { action, stubs } = buildStubbedAction()
    await action({
      ...DEFAULT_ACTION_DATA,
      context: {
        ...DEFAULT_ACTION_DATA.context,
        eventName: 'workflow_dispatch',
      },
    })

    sinon.assert.notCalled(stubs.logStub.logError)
    sinon.assert.calledOnce(stubs.openPrStub)
  }
)

tap.test(
  'npm should be configured if called with npm-token in inputs',
  async () => {
    const { action, stubs } = buildStubbedAction()
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
  }
)

tap.test(
  'semver-auto: should call getAutoBumpedVersion if semver is auto',
  async t => {
    const { bumpVersion, stubs } = buildStubbedAction()

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
    t.same(newVersion, '3.0.0')
  }
)

tap.test(
  'semver-auto: should not call getAutoBumpedVersion if semver is not auto',
  async t => {
    const { bumpVersion, stubs } = buildStubbedAction()

    stubs.execWithOutputStub.onCall(1).resolves('3.1.1')

    const inputs = { semver: 'patch' }
    const newVersion = await bumpVersion({
      inputs,
    })

    sinon.assert.notCalled(stubs.bumpStub)
    sinon.assert.calledTwice(stubs.execWithOutputStub)
    t.same(newVersion, '3.1.1')
  }
)

tap.test('semver-auto: should bump major if breaking change', async t => {
  const { bumpVersion, stubs } = buildStubbedAction()

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
  t.same(newVersion, '3.0.0')
})

tap.test('semver-auto: should bump minor if its a feat', async t => {
  const { bumpVersion, stubs } = buildStubbedAction()

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
  t.same(newVersion, '3.0.0')
})

tap.test('semver-auto: should bump patch if its a fix', async t => {
  const { bumpVersion, stubs } = buildStubbedAction()

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
  t.same(newVersion, '3.0.0')
})

tap.test(
  'semver-auto: should use the correct base tag if specified',
  async t => {
    const { bumpVersion, stubs } = buildStubbedAction()

    stubs.bumpStub.resolves({ releaseType: 'patch' })
    stubs.execWithOutputStub.onCall(3).resolves('3.0.0')

    const inputs = { semver: 'auto', 'base-tag': 'v1.0.0' }
    const newVersion = await bumpVersion({
      inputs,
    })

    sinon.assert.calledOnce(stubs.bumpStub)
    sinon.assert.calledWithExactly(stubs.bumpStub, {
      baseTag: 'v1.0.0',
      config: stubs.conventionalcommitsStub,
    })
    sinon.assert.callCount(stubs.execWithOutputStub, 4)
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'npm', [
      'version',
      '--no-git-tag-version',
      '--preid=',
      'patch',
    ])
    t.same(newVersion, '3.0.0')
  }
)

tap.test(
  'semver-auto: should get the latest tag if base tag not provided',
  async t => {
    const { bumpVersion, stubs } = buildStubbedAction()

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
      config: stubs.conventionalcommitsStub,
    })
    sinon.assert.callCount(stubs.execWithOutputStub, 5)
    sinon.assert.calledWithExactly(stubs.execWithOutputStub, 'npm', [
      'version',
      '--no-git-tag-version',
      '--preid=',
      'patch',
    ])
    t.same(newVersion, '3.0.0')
  }
)

tap.test('semver-auto: should throw if auto bump fails', async t => {
  const { bumpVersion, stubs } = buildStubbedAction()

  stubs.bumpStub.throws(new Error('bump failed'))
  stubs.execWithOutputStub.onCall(2).resolves('v1.0.0' + '\n' + 'v1.1.1')

  const inputs = { semver: 'auto' }
  try {
    await bumpVersion({
      inputs,
    })
  } catch (error) {
    stubs.coreStub.calledOnceWithExactly('bump failed')
    t.pass()
  }
})

tap.test('semver-auto: should default to patch if auto bump fails', async t => {
  const { bumpVersion, stubs } = buildStubbedAction()

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
    config: stubs.conventionalcommitsStub,
  })
  sinon.assert.callCount(stubs.execWithOutputStub, 5)
  sinon.assert.calledWithExactly(stubs.execWithOutputStub.getCall(3), 'npm', [
    'version',
    '--no-git-tag-version',
    '--preid=',
    'patch',
  ])
  t.same(newVersion, '3.0.0')
})
