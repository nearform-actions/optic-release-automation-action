'use strict'

const { test, afterEach } = require('tap')
const sinon = require('sinon')
const semver = require('semver')
const proxyquire = require('proxyquire')

const { getBumpedVersion } = require('../src/utils/bump')

function getGithubGraphqlClient(stub) {
  return {
    graphql: stub,
  }
}

const DEFAULT_CONTEXT = {
  owner: 'nearform',
  repo: 'test-repo',
}

const getLatestReleaseStub = release => ({
  repository: {
    latestRelease: {
      tagName: release || 'v2.4.6',
      tagCommit: {
        oid: 'c40e533872630d3dc632539f140586bf5b9f0ea8',
        committedDate: '2022-12-12T10:21:25Z',
      },
    },
  },
})

const getCommitsSinceLastReleaseStub = commits => ({
  repository: {
    defaultBranchRef: {
      target: {
        history: {
          nodes: commits,
        },
      },
    },
  },
})

const getStubbedFunction = semverStub => {
  const { getBumpedVersion } = proxyquire('../src/utils/bump', {
    semver: semverStub,
  })

  return getBumpedVersion
}

afterEach(() => {
  sinon.restore()
})

test('should bump patch version by default if no conventional commits found', async t => {
  const githubApiResponse = sinon.stub()

  const commits = [
    {
      oid: '2d12849ca17781fed9a959004a2eebc0b1c24062',
      message: 'test',
      committedDate: '2022-12-09T15:11:56Z',
    },
  ]

  githubApiResponse.onCall(0).resolves(getLatestReleaseStub())
  githubApiResponse.onCall(1).resolves(getCommitsSinceLastReleaseStub(commits))

  const newversion = await getBumpedVersion({
    github: getGithubGraphqlClient(githubApiResponse),
    context: DEFAULT_CONTEXT,
  })

  t.same(newversion, '2.4.7')
})

test('should bump major version if breaking change commit found', async t => {
  const githubApiResponse = sinon.stub()

  const commits = [
    {
      oid: '2d12849ca17781fed9a959004a2eebc0b1c24062',
      message: 'BREAKING CHANGE: this will break everything',
      committedDate: '2022-12-09T15:11:56Z',
    },
    {
      oid: '2d12849ca17781fed9a959004a2eebc0b1c24062',
      message: 'feat: this is a minor feature',
      committedDate: '2022-12-09T15:11:56Z',
    },
  ]

  githubApiResponse.onCall(0).resolves(getLatestReleaseStub())
  githubApiResponse.onCall(1).resolves(getCommitsSinceLastReleaseStub(commits))

  const newversion = await getBumpedVersion({
    github: getGithubGraphqlClient(githubApiResponse),
    context: DEFAULT_CONTEXT,
  })

  t.same(newversion, '3.0.0')
})

test('should bump minor version if feat commit found', async t => {
  const githubApiResponse = sinon.stub()

  const commits = [
    {
      oid: '2d12849ca17781fed9a959004a2eebc0b1c24062',
      message: 'feat: this is a minor feature',
      committedDate: '2022-12-09T15:11:56Z',
    },
    {
      oid: '2d12849ca17781fed9a959004a2eebc0b1c24062',
      message: 'fix: this is a minor feature',
      committedDate: '2022-12-09T15:11:56Z',
    },
  ]

  githubApiResponse.onCall(0).resolves(getLatestReleaseStub())
  githubApiResponse.onCall(1).resolves(getCommitsSinceLastReleaseStub(commits))

  const newversion = await getBumpedVersion({
    github: getGithubGraphqlClient(githubApiResponse),
    context: DEFAULT_CONTEXT,
  })

  t.same(newversion, '2.5.0')
})

test('should bump patch version if fix commit found', async t => {
  const githubApiResponse = sinon.stub()

  const commits = [
    {
      oid: '2d12849ca17781fed9a959004a2eebc0b1c24062',
      message: 'fix: this is a minor feature',
      committedDate: '2022-12-09T15:11:56Z',
    },
  ]

  githubApiResponse.onCall(0).resolves(getLatestReleaseStub())
  githubApiResponse.onCall(1).resolves(getCommitsSinceLastReleaseStub(commits))

  const newversion = await getBumpedVersion({
    github: getGithubGraphqlClient(githubApiResponse),
    context: DEFAULT_CONTEXT,
  })

  t.same(newversion, '2.4.7')
})

test('should throw if no commits found', async t => {
  const githubApiResponse = sinon.stub()

  const commits = []

  githubApiResponse.onCall(0).resolves(getLatestReleaseStub())
  githubApiResponse.onCall(1).resolves(getCommitsSinceLastReleaseStub(commits))

  try {
    await getBumpedVersion({
      github: getGithubGraphqlClient(githubApiResponse),
      context: DEFAULT_CONTEXT,
    })
  } catch (error) {
    t.same(error.message, 'No commits found since last release')
  }
})

test('should throw if no release details found', async t => {
  const githubApiResponse = sinon.stub()

  githubApiResponse.onCall(0).resolves({
    latestReleaseCommitSha: null,
    latestReleaseTagName: null,
    latestReleaseCommitDate: null,
  })

  try {
    await getBumpedVersion({
      github: getGithubGraphqlClient(githubApiResponse),
      context: DEFAULT_CONTEXT,
    })
  } catch (error) {
    t.same(error.message, `Couldn't find latest release`)
  }
})

test('should fail if invalid current version', async t => {
  const githubApiResponse = sinon.stub()
  const semverStub = sinon
    .stub(semver, 'parse')
    .returns({ major: 1, minor: 'test', patch: 1 })

  const getBumpedVersionProxy = getStubbedFunction(semverStub)

  const commits = [
    {
      oid: '2d12849ca17781fed9a959004a2eebc0b1c24062',
      message: 'fix: this is a minor feature',
      committedDate: '2022-12-09T15:11:56Z',
    },
  ]

  githubApiResponse.onCall(0).resolves(getLatestReleaseStub())
  githubApiResponse.onCall(1).resolves(getCommitsSinceLastReleaseStub(commits))

  try {
    await getBumpedVersionProxy({
      github: getGithubGraphqlClient(githubApiResponse),
      context: DEFAULT_CONTEXT,
    })
  } catch (error) {
    t.same(error.message, 'Invalid major/minor/patch version found')
  }
})

test('should fail if new version is not semver compatible', async t => {
  const githubApiResponse = sinon.stub()
  const semverStub = sinon.stub(semver, 'valid').returns(null)

  const getBumpedVersionProxy = getStubbedFunction(semverStub)

  const commits = [
    {
      oid: '2d12849ca17781fed9a959004a2eebc0b1c24062',
      message: 'fix: this is a minor feature',
      committedDate: '2022-12-09T15:11:56Z',
    },
  ]

  githubApiResponse.onCall(0).resolves(getLatestReleaseStub())
  githubApiResponse.onCall(1).resolves(getCommitsSinceLastReleaseStub(commits))

  try {
    await getBumpedVersionProxy({
      github: getGithubGraphqlClient(githubApiResponse),
      context: DEFAULT_CONTEXT,
    })
  } catch (error) {
    t.same(error.message, 'Invalid bumped version 2.4.7')
  }
})
