'use strict'

const tap = require('tap')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const core = require('@actions/core')
const clone = require('lodash.clonedeep')

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
let getReleaseStub = sinon.stub().returns({ data: { draft: true } })

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

/**
 * @param {{ npmVersion: string | undefined, env: Record<string, string> | undefined }} [options]
 */
function setup({ npmVersion, env, isPublished = true, isScoped = true } = {}) {
  if (env) {
    // Add any test-specific environment variables. They get cleaned up by tap.afterEach(sinon.restore).
    Object.entries(env).forEach(([key, value]) => {
      sinon.stub(process, 'env').value({ [key]: value })
    })
  }

  const logStub = sinon.stub(actionLog)
  const coreStub = sinon.stub(core)
  deleteReleaseStub.resetHistory()
  deleteReleaseStub.resolves()

  const execWithOutputStub = sinon.stub()
  execWithOutputStub
    .withArgs('curl', [
      '-s',
      'https://optic-test.run.app/api/generate/optic-token',
    ])
    .returns('otp123')

  const tagVersionStub = sinon.stub(tagVersionAction, 'tagVersionInGit')
  const revertCommitStub = sinon.stub(revertCommitAction, 'revertCommit')
  const publishToNpmStub = sinon.stub(publishToNpmAction, 'publishToNpm')
  const notifyIssuesStub = sinon.stub(notifyIssuesAction, 'notifyIssues')

  const packageName = isScoped ? '@some/package-name' : 'some-package-name'
  const provenanceProxy = proxyquire('../src/utils/provenance', {
    './packageInfo': {
      getLocalInfo: () => ({ name: packageName }),
      getPublishedInfo: async () => isPublished ? { name: packageName } : null
    }
  })
  if (npmVersion) provenanceProxy.getNpmVersion = () => npmVersion

  const callApiStub = sinon
    .stub(callApiAction, 'callApi')
    .resolves({ data: { body: 'test_body', html_url: 'test_url' } })

  const proxyStubs = {
    './utils/execWithOutput': { execWithOutput: execWithOutputStub },
    './utils/tagVersion': tagVersionStub,
    './utils/revertCommit': revertCommitStub,
    './utils/publishToNpm': publishToNpmStub,
    './utils/notifyIssues': notifyIssuesStub,
    './utils/provenance': provenanceProxy,
    '@actions/core': coreStub,
  }

  const release = proxyquire('../src/release', proxyStubs)

  return {
    release,
    stubs: {
      tagVersionStub,
      revertCommitStub,
      publishToNpmStub,
      notifyIssuesStub,
      execWithOutputStub,
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
    stubs.execWithOutputStub.rejects(
      new Error('Something went wrong in the branch')
    )

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
    stubs.execWithOutputStub.rejects(
      new Error('Something went wrong in the branch')
    )
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

tap.test(
  'Should publish with provenance if flag set and conditions met',
  async t => {
    const { release, stubs } = setup({
      npmVersion: '9.5.0', // valid
      env: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' }, // valid
    })
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: 'true',
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    t.pass('not failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      provenance: true,
    })
    t.pass('publish called')
  }
)

tap.test('Aborts publish with provenance if NPM version too old', async t => {
  const { release, stubs } = setup({
    npmVersion: '9.4.0', // too old (is before 9.5.0)
    env: { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' }, // valid
  })

  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'app-name': APP_NAME,
      'npm-token': 'a-token',
      provenance: 'true',
    },
  })

  sinon.assert.calledWithMatch(
    stubs.coreStub.setFailed,
    'Provenance requires NPM >=9.5.0, but this action is using v9.4.0'
  )
  t.pass('did set failed')
})

tap.test('Aborts publish with provenance if missing permission', async t => {
  const { release, stubs } = setup({
    npmVersion: '9.5.0', // valid, but before missing var is correctly handled on NPM's side (9.6.1)
    // missing ACTIONS_ID_TOKEN_REQUEST_URL which is set from `id-token: write` permission.
  })

  await release({
    ...DEFAULT_ACTION_DATA,
    inputs: {
      'app-name': APP_NAME,
      'npm-token': 'a-token',
      provenance: 'true',
    },
  })

  sinon.assert.calledWithMatch(
    stubs.coreStub.setFailed,
    'Provenance generation in GitHub Actions requires "write" access to the "id-token" permission'
  )
  t.pass('did set failed')
})

tap.test(
  'Should publish with --access public if flag set',
  async t => {
    const { release, stubs } = setup()
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        access: 'public',
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    t.pass('did not set failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      access: 'public',
    })
    t.pass('called publishToNpm')
  }
)

tap.test(
  'Should publish with --access restricted if flag set',
  async t => {
    const { release, stubs } = setup()
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        access: 'restricted',
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    t.pass('did not set failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      access: 'restricted',
    })
    t.pass('called publishToNpm')
  }
)

tap.test(
  'Should disallow unsupported --access flag',
  async t => {
    const { release, stubs } = setup()

    const invalidString = 'public; node -e "throw new Error(`arbitrary command executed`)"'

    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        access: invalidString,
      },
    })

    sinon.assert.calledWithMatch(
      stubs.coreStub.setFailed,
      `Invalid "access" option provided ("${invalidString}"), should be one of "public", "restricted"`
    )
    t.pass('did set failed')
  }
)

tap.test(
  'Should publish with --access public and provenance if unscoped and unpublished',
  async t => {
    const { release, stubs } = setup({ isScoped: false, isPublished: false })
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: true,
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    t.pass('did not set failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      access: 'public',
      provenance: true,
    })
    t.pass('called publishToNpm')
  }
)

tap.test(
  'Should not override access restricted with provenance while unscoped and unpublished',
  async t => {
    const { release, stubs } = setup({ isScoped: false, isPublished: false })
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: true,
        access: 'restricted',
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    t.pass('did not set failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      access: 'restricted',
      provenance: true,
    })
    t.pass('called publishToNpm')
  }
)

tap.test(
  'Should publish with provenance and not add access when scoped and unpublished',
  async t => {
    const { release, stubs } = setup({ isScoped: true, isPublished: false })
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: true,
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    t.pass('did not set failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      provenance: true,
    })
    t.pass('called publishToNpm')
  }
)

tap.test(
  'Should publish with provenance and not add access when unscoped and published',
  async t => {
    const { release, stubs } = setup({ isScoped: false, isPublished: true })
    await release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        provenance: true,
      },
    })

    sinon.assert.notCalled(stubs.coreStub.setFailed)
    t.pass('did not set failed')

    sinon.assert.calledWithMatch(stubs.publishToNpmStub, {
      npmToken: 'a-token',
      opticUrl: 'https://optic-test.run.app/api/generate/',
      npmTag: 'latest',
      provenance: true,
    })
    t.pass('called publishToNpm')
  }
)

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
        isPreRelease: false,
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
  'Should call the release method with the prerelease flag if the release is a prerelease',
  async () => {
    const { release, stubs } = setup()

    const version = 'v5.1.3-next.1'
    const data = clone(DEFAULT_ACTION_DATA)
    data.context.payload.pull_request.body =
      '<!--\n' +
      `<release-meta>{"id":54503465,"version":"${version}","npmTag":"latest","opticUrl":"https://optic-test.run.app/api/generate/"}</release-meta>\n` +
      '-->'

    await release({
      ...data,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      },
    })

    sinon.assert.notCalled(stubs.tagVersionStub)

    sinon.assert.calledWithExactly(
      stubs.callApiStub,
      {
        endpoint: 'release',
        method: 'PATCH',
        body: {
          version,
          releaseId: 54503465,
          isPreRelease: true,
        },
      },
      {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'optic-token': 'optic-token',
        'sync-semver-tags': 'true',
      }
    )
  }
)

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
    sinon.assert.notCalled(stubs.execWithOutputStub)
  }
)

tap.test('Should fail if the release metadata is incorrect', async () => {
  const { release, stubs } = setup()
  const data = clone(DEFAULT_ACTION_DATA)
  data.context.payload.pull_request.body = 'this data is not correct'
  await release(data)

  sinon.assert.calledOnce(stubs.logStub.logError)
  sinon.assert.notCalled(stubs.callApiStub)
  sinon.assert.notCalled(stubs.execWithOutputStub)
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
    sinon.assert.calledWithExactly(stubs.execWithOutputStub.getCall(0), 'git', [
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

    sinon.assert.neverCalledWith(stubs.execWithOutputStub, 'git', [
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

tap.test('Should not reject when notifyIssues fails', async t => {
  const { release, stubs } = setup()

  stubs.notifyIssuesStub.rejects()

  t.resolves(
    release({
      ...DEFAULT_ACTION_DATA,
      inputs: {
        'app-name': APP_NAME,
        'npm-token': 'a-token',
        'notify-linked-issues': 'true',
      },
    })
  )
})

tap.test('Should fail when getting draft release fails', async () => {
  const { release, stubs } = setup()

  await release({
    ...DEFAULT_ACTION_DATA,
    github: {
      ...DEFAULT_ACTION_DATA.github,
      rest: {
        ...DEFAULT_ACTION_DATA.github.rest,
        repos: {
          ...DEFAULT_ACTION_DATA.github.rest,
          getRelease: sinon.stub().rejects(),
        },
      },
    },
  })

  sinon.assert.called(stubs.coreStub.setFailed)
})

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
          getRelease: sinon.stub().returns({ data: undefined }),
        },
      },
    },
  })

  sinon.assert.calledWith(
    stubs.coreStub.setFailed,
    `Couldn't find draft release to publish. Aborting.`
  )
})

tap.test('Should not fail when release is not a draft', async () => {
  const { release, stubs } = setup()

  await release({
    ...DEFAULT_ACTION_DATA,
    github: {
      ...DEFAULT_ACTION_DATA.github,
      rest: {
        ...DEFAULT_ACTION_DATA.github.rest,
        repos: {
          ...DEFAULT_ACTION_DATA.github.rest,
          getRelease: sinon.stub().returns({ data: { draft: false } }),
        },
      },
    },
  })

  sinon.assert.notCalled(stubs.coreStub.setFailed)
})
