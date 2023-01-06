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
  const runSpawnStub = sinon.stub()
  const conventionalcommitsStub = sinon.stub()

  const { runAction, bumpVersion } = proxyquire('../src/index', {
    './log': logStub,
    './release': releaseStub.resolves(),
    './openPr': openPrStub.resolves(),
    './utils/runSpawn': {
      runSpawn: () => runSpawnStub.resolves(),
    },
    util: {
      promisify: () => bumpStub,
    },
    'conventional-changelog-monorepo/conventional-changelog-conventionalcommits':
      conventionalcommitsStub,
    'conventional-changelog-monorepo/conventional-recommended-bump':
      sinon.stub(),
  })

  return {
    action: runAction,
    bumpVersion,
    stubs: {
      logStub,
      releaseStub,
      openPrStub,
      bumpStub,
      runSpawnStub,
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

tap.test('should call getAutoBumpedVersion if semver is auto', async t => {
  const { bumpVersion, stubs } = buildStubbedAction()

  stubs.bumpStub.resolves({ releaseType: 'major' })
  stubs.runSpawnStub.onFirstCall().resolves()
  stubs.runSpawnStub.onSecondCall().resolves('3.0.0')

  const inputs = { semver: 'auto' }
  const newVersion = await bumpVersion({
    inputs,
  })

  sinon.assert.calledOnce(stubs.bumpStub)
  sinon.assert.calledTwice(stubs.runSpawnStub)
  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'npm', [
    'version',
    '--no-git-tag-version',
    '--preid=',
    'major',
  ])
  t.same(newVersion, '3.0.0')
})

tap.test(
  'should not call getAutoBumpedVersion if semver is not auto',
  async t => {
    const { bumpVersion, stubs } = buildStubbedAction()

    stubs.runSpawnStub.onFirstCall().resolves()
    stubs.runSpawnStub.onSecondCall().resolves('3.1.1')

    const inputs = { semver: 'patch' }
    const newVersion = await bumpVersion({
      inputs,
    })

    sinon.assert.notCalled(stubs.bumpStub)
    sinon.assert.calledTwice(stubs.runSpawnStub)
    t.same(newVersion, '3.1.1')
  }
)

tap.test('semver-auto: should bump major if breaking change', async t => {
  const { bumpVersion, stubs } = buildStubbedAction()

  stubs.bumpStub.resolves({ releaseType: 'major' })
  stubs.runSpawnStub.onFirstCall().resolves()
  stubs.runSpawnStub.onSecondCall().resolves('3.0.0')

  const inputs = { semver: 'auto' }
  const newVersion = await bumpVersion({
    inputs,
  })

  sinon.assert.calledOnce(stubs.bumpStub)
  sinon.assert.calledTwice(stubs.runSpawnStub)
  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'npm', [
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
  stubs.runSpawnStub.onFirstCall().resolves()
  stubs.runSpawnStub.onSecondCall().resolves('3.0.0')

  const inputs = { semver: 'auto' }
  const newVersion = await bumpVersion({
    inputs,
  })

  sinon.assert.calledOnce(stubs.bumpStub)
  sinon.assert.calledTwice(stubs.runSpawnStub)
  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'npm', [
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
  stubs.runSpawnStub.onFirstCall().resolves()
  stubs.runSpawnStub.onSecondCall().resolves('3.0.0')

  const inputs = { semver: 'auto' }
  const newVersion = await bumpVersion({
    inputs,
  })

  sinon.assert.calledOnce(stubs.bumpStub)
  sinon.assert.calledTwice(stubs.runSpawnStub)
  sinon.assert.calledWithExactly(stubs.runSpawnStub, 'npm', [
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
    stubs.runSpawnStub.onFirstCall().resolves()
    stubs.runSpawnStub.onSecondCall().resolves('3.0.0')

    const inputs = { semver: 'auto' }
    inputs['base-tag'] = 'v1.0.0'
    const newVersion = await bumpVersion({
      inputs,
    })

    sinon.assert.calledOnce(stubs.bumpStub)
    sinon.assert.calledWithExactly(stubs.bumpStub, {
      baseTag: 'v1.0.0',
      config: stubs.conventionalcommitsStub,
    })
    sinon.assert.calledTwice(stubs.runSpawnStub)
    sinon.assert.calledWithExactly(stubs.runSpawnStub, 'npm', [
      'version',
      '--no-git-tag-version',
      '--preid=',
      'patch',
    ])
    t.same(newVersion, '3.0.0')
  }
)
