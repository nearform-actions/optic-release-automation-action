'use strict'

const tap = require('tap')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const core = require('@actions/core')
const clone = require('lodash.clonedeep')

const runSpawnAction = require('../src/utils/runSpawn')
const tagVersionAction = require('../src/utils/tagVersion')
const publishToNpmAction = require('../src/utils/publishToNpm')
const notifyIssuesAction = require('../src/utils/notifyIssues')
const revertCommitAction = require('../src/utils/revertCommit')
const callApiAction = require('../src/utils/callApi')

const { PR_TITLE_PREFIX, APP_NAME } = require('../src/const')
const actionLog = require('../src/log')

let deleteReleaseStub = sinon.stub().resolves()

let pullsGetStub = sinon.stub()
let createCommentStub = sinon.stub()
let getReleaseStub = sinon.stub().returns({ draft: true })

const DEFAULT_ACTION_DATA = {
  github: {
    rest: {
      repos: {
        deleteRelease: deleteReleaseStub,
        getRelease: getReleaseStub,
      },
      issues: { createComment: createCommentStub },
      pulls: { get: pullsGetStub },
    },
  },
  inputs: {
    semver: 'patch',
    'app-name': APP_NAME,
  },
  context: {
    eventName: 'pull_request',
    repo: {
      repo: 'repo',
      owner: 'test',
    },
    payload: {
      ref: 'ref',
      action: 'closed',
      pull_request: {
        base: {
          ref: 'base-ref',
        },
        merged: true,
        user: { login: 'optic-release-automation[bot]' },
        title: PR_TITLE_PREFIX,
        body:
          '<!--\n' +
          '<release-meta>{"id":54503465,"version":"v5.1.3","npmTag":"latest","opticUrl":"https://optic-test.run.app/api/generate/"}</release-meta>\n' +
          '-->',
      },
    },
  },
  packageVersion: '1.1.1',
  packageName: 'testPackageName',
}

function setup() {
  const logStub = sinon.stub(actionLog)
  const coreStub = sinon.stub(core)
  deleteReleaseStub.resetHistory()
  deleteReleaseStub.resolves()

  const runSpawnStub = sinon.stub()
  runSpawnStub
    .withArgs('curl', [
      '-s',
      'https://optic-test.run.app/api/generate/optic-token',
    ])
    .returns('otp123')

  const runSpawnProxy = sinon
    .stub(runSpawnAction, 'runSpawn')
    .returns(runSpawnStub)

  const tagVersionStub = sinon.stub(tagVersionAction, 'tagVersionInGit')
  const revertCommitStub = sinon.stub(revertCommitAction, 'revertCommit')
  const publishToNpmStub = sinon.stub(publishToNpmAction, 'publishToNpm')
  const notifyIssuesStub = sinon.stub(notifyIssuesAction, 'notifyIssues')

  const callApiStub = sinon
    .stub(callApiAction, 'callApi')
    .resolves({ data: { body: 'test_body', html_url: 'test_url' } })

  const release = proxyquire('../src/release', {
    './utils/runSpawn': runSpawnProxy,
    './utils/tagVersion': tagVersionStub,
    './utils/revertCommit': revertCommitStub,
    './utils/publishToNpm': publishToNpmStub,
    './utils/notifyIssues': notifyIssuesStub,
    '@actions/core': coreStub,
  })

  return {
    release,
    stubs: {
      tagVersionStub,
      revertCommitStub,
      publishToNpmStub,
      notifyIssuesStub,
      runSpawnProxy,
      runSpawnStub,
      callApiStub,
      logStub,
      coreStub,
    },
  }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('Should delete the release if the pr is not merged', async () => {
  const { release } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.merged = false
  await release(data)

  sinon.assert.calledOnceWithExactly(deleteReleaseStub, {
    owner: DEFAULT_ACTION_DATA.context.repo.owner,
    repo: DEFAULT_ACTION_DATA.context.repo.repo,
    release_id: 54503465,
  })
})

tap.test(
  'Should delete the release even if deleting the branch failed and should not fail',
  async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    stubs.runSpawnStub.rejects(new Error('Something went wrong in the branch'))

    await release(data)

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    sinon.assert.calledOnceWithExactly(deleteReleaseStub, {
      owner: DEFAULT_ACTION_DATA.context.repo.owner,
      repo: DEFAULT_ACTION_DATA.context.repo.repo,
      release_id: 54503465,
    })
  }
)

tap.test('Should log an error if deleting the release fails', async () => {
  const { release, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.merged = false
  deleteReleaseStub.rejects(new Error('Something went wrong in the release'))

  await release(data)

  sinon.assert.calledOnceWithExactly(
    stubs.coreStub.setFailed,
    `Something went wrong while deleting the release. \n Errors: Something went wrong in the release`
  )
})

tap.test(
  'Should log and exit if both the release and the branch fail',
  async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    stubs.runSpawnStub.rejects(new Error('Something went wrong in the branch'))
    deleteReleaseStub.rejects(new Error('Something went wrong in the release'))

    await release(data)

    sinon.assert.calledOnceWithExactly(
      stubs.coreStub.setFailed,
      `Something went wrong while deleting the release. \n Errors: Something went wrong in the release`
    )
    sinon.assert.notCalled(stubs.publishToNpmStub)
  }
)

tap.test('Should publish to npm without optic', async () => {
  const { release, stubs } = setup()
  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'app-name': APP_NAME,
      'npm-token': 'a-token',
    },
  })

  sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
    npmToken: 'a-token',
    opticUrl: 'https://optic-test.run.app/api/generate/',
    npmTag: 'latest',
  })
})

tap.test('Should not publish to npm if there is no npm token', async () => {
  const { release, stubs } = setup()
  stubs.callApiStub.throws()

  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'app-name': APP_NAME,
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    },
  })

  sinon.assert.notCalled(stubs.publishToNpmStub)
})

tap.test('Should publish to npm with optic', async () => {
  const { release, stubs } = setup()
  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'app-name': APP_NAME,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
    },
  })

  sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
    npmToken: 'a-token',
    opticUrl: 'https://optic-test.run.app/api/generate/',
    npmTag: 'latest',
  })
})

tap.test('Should tag versions', async () => {
  const { release, stubs } = setup()
  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'app-name': APP_NAME,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    },
  })

  sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5')
  sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5.1')
  sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5.1.3')
})

tap.test('Should call the release method', async () => {
  const { release, stubs } = setup()
  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'app-name': APP_NAME,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    },
  })

  sinon.assert.calledWithExactly(
    stubs.callApiStub,
    {
      endpoint: 'release',
      method: 'PATCH',
      body: {
        version: 'v5.1.3',
        releaseId: 54503465,
      },
    },
    {
      'app-name': APP_NAME,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
  )
})

tap.test(
  "Should NOT call the release method if the pr wasn't merged",
  async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.merged = false
    data.inputs = {
      ...data.inputs,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
    await release(data)

    sinon.assert.notCalled(stubs.callApiStub)
  }
)

tap.test("Should NOT use npm if the pr wasn't merged", async () => {
  const { release, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.merged = false
  data.inputs = {
    ...data.inputs,
    'npm-token': 'a-token',
    'optic-token': 'optic-token',
    'sync-semver-tags': 'true',
  }
  await release(data)
  sinon.assert.notCalled(stubs.publishToNpmStub)
})

tap.test("Should NOT tag version in git if the pr wasn't merged", async () => {
  const { release, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.merged = false
  data.inputs = {
    ...data.inputs,
    'npm-token': 'a-token',
    'optic-token': 'optic-token',
    'sync-semver-tags': 'true',
  }
  await release(data)
  sinon.assert.notCalled(stubs.tagVersionStub)
})

tap.test(
  'Should not do anything if the user is not optic-release-automation[bot]',
  async () => {
    const { release, stubs } = setup()
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.user.login = 'not_the_correct_one'
    await release(data)

    sinon.assert.notCalled(stubs.callApiStub)
    sinon.assert.notCalled(stubs.runSpawnStub)
  }
)

tap.test('Should fail if the release metadata is incorrect', async () => {
  const { release, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.body = 'this data is not correct'
  await release(data)

  sinon.assert.calledOnce(stubs.logStub.logError)
  sinon.assert.notCalled(stubs.callApiStub)
  sinon.assert.notCalled(stubs.runSpawnStub)
})

tap.test(
  'Should call core.setFailed if the tagging the version in git fails',
  async () => {
    const { release, stubs } = setup()
    stubs.tagVersionStub.throws()

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
    })

    sinon.assert.calledOnce(stubs.coreStub.setFailed)
  }
)

tap.test('Should call core.setFailed if the release fails', async () => {
  const { release, stubs } = setup()
  stubs.callApiStub.throws()

  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'app-name': APP_NAME,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
      'revert-commit-after-failure': 'true',
    },
  })

  sinon.assert.calledWithExactly(stubs.revertCommitStub, 'base-ref')
  sinon.assert.calledOnce(stubs.coreStub.setFailed)
})

tap.test(
  'Should call core.setFailed but not revert the commit when publish to npm fails',
  async () => {
    const { release, stubs } = setup()
    stubs.publishToNpmStub.throws()

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
    })

    sinon.assert.notCalled(stubs.revertCommitStub)
    sinon.assert.calledOnce(stubs.coreStub.setFailed)
  }
)

tap.test(
  'Should call core.setFailed and revert the commit when publish to npm fails',
  async () => {
    const { release, stubs } = setup()
    stubs.publishToNpmStub.throws()

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
        'revert-commit-after-failure': 'true',
      },
    })

    sinon.assert.calledWithExactly(stubs.revertCommitStub, 'base-ref')
    sinon.assert.calledOnce(stubs.coreStub.setFailed)
  }
)

tap.test('Should tag the major, minor & patch correctly for 0', async () => {
  const { release, stubs } = setup()
  stubs.callApiStub.throws()

  const data = clone(DEFAULT_ACTION_DATA)
  data.inputs = {
    ...data.inputs,
    'npm-token': 'a-token',
    'optic-token': 'optic-token',
    'sync-semver-tags': 'true',
  }
  data.context.payload.pull_request.body =
    '<!--\n' +
    '<release-meta>{"id":54503465,"version":"v0.0.1","npmTag":"latest","opticUrl":"https://optic-zf3votdk5a-ew.a.run.app/api/generate/"}</release-meta>\n' +
    '-->'

  await release(data)

  sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v0')
  sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v0.0')
  sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v0.0.1')
})

tap.test('Should tag the major, minor & patch correctly', async () => {
  const { release, stubs } = setup()
  stubs.callApiStub.throws()

  const data = clone(DEFAULT_ACTION_DATA)
  data.inputs = {
    ...data.inputs,
    'npm-token': 'a-token',
    'optic-token': 'optic-token',
    'sync-semver-tags': 'true',
  }
  data.context.payload.pull_request.body =
    '<!--\n' +
    '<release-meta>{"id":54503465,"version":"v5.0.0","npmTag":"latest","opticUrl":"https://optic-zf3votdk5a-ew.a.run.app/api/generate/"}</release-meta>\n' +
    '-->'

  await release(data)

  sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5')
  sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5.0')
  sinon.assert.calledWithExactly(stubs.tagVersionStub, 'v5.0.0')
})

tap.test(
  'Should delete the release branch ALWAYS when the PR is closed',
  async () => {
    const { release, stubs } = setup()

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
    })

    // We check that it's actually the first command line command to be executed
    sinon.assert.calledWithExactly(stubs.runSpawnStub.getCall(0), 'git', [
      'push',
      'origin',
      '--delete',
      'release/v5.1.3',
    ])
  }
)

tap.test(
  'Should NOT delete the release branch if the PR is not closed',
  async () => {
    const { release, stubs } = setup()

    const data = clone(DEFAULT_ACTION_DATA)
    data.inputs = {
      ...data.inputs,
      'npm-token': 'a-token',
      'optic-token': 'optic-token',
      'sync-semver-tags': 'true',
    }
    data.context.payload.action = 'something_else' // Not closed

    await release(data)

    sinon.assert.neverCalledWith(stubs.runSpawnStub, 'git', [
      'push',
      'origin',
      '--delete',
      'release/v5.1.3',
    ])
  }
)

tap.test(
  'Should call notifyIssues function correctly when feature is enabled',
  async () => {
    const { release, stubs } = setup()
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'notify-linked-issues': 'true',
      },
    })

    sinon.assert.calledWith(
      stubs.notifyIssuesStub,
      DEFAULT_ACTION_DATA.github,
      true,
      'test',
      'repo',
      { body: 'test_body', html_url: 'test_url' }
    )
  }
)

tap.test(
  'Should not call notifyIssues function when feature is disabled',
  async () => {
    const { release, stubs } = setup()
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'notify-linked-issues': 'false',
      },
    })

    sinon.assert.notCalled(stubs.notifyIssuesStub)
  }
)

tap.test('Should fail when release is not found', async () => {
  const { release, stubs } = setup()

  await release({
    ...DEFAULT_ACTION_DATA,
    github: {
      ...DEFAULT_ACTION_DATA.github,
      rest: {
        ...DEFAULT_ACTION_DATA.github.rest,
        repos: {
          ...DEFAULT_ACTION_DATA.github.rest,
          getRelease: sinon.stub().returns(undefined),
        },
      },
    },
  })

  sinon.assert.called(stubs.coreStub.setFailed)
})

tap.test('Should fail when release is not a draft', async () => {
  const { release, stubs } = setup()

  await release({
    ...DEFAULT_ACTION_DATA,
    github: {
      ...DEFAULT_ACTION_DATA.github,
      rest: {
        ...DEFAULT_ACTION_DATA.github.rest,
        repos: {
          ...DEFAULT_ACTION_DATA.github.rest,
          getRelease: sinon.stub().returns({ draft: false }),
        },
      },
    },
  })

  sinon.assert.called(stubs.coreStub.setFailed)
})
