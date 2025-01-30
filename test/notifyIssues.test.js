'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const sinon = require('sinon')
const fs = require('node:fs')

const pullsGetStub = sinon.stub()
const createCommentStub = sinon.stub()
const noDataGraphqlStub = sinon.stub().resolves({
  repository: {
    pullRequest: {
      closingIssuesReferences: {},
    },
  },
})

const DEFAULT_GITHUB_CLIENT = {
  rest: {
    issues: { createComment: createCommentStub },
    pulls: { get: pullsGetStub },
  },
  graphql: noDataGraphqlStub,
}

function setupTest() {
  sinon
    .stub(fs, 'readFileSync')
    .returns('{ "name": "packageName", "version": "1.0.0"}')
}

const { notifyIssues } = require('../src/utils/notifyIssues')

test('notifyIssues tests', async t => {
  t.beforeEach(() => {
    setupTest()
  })

  t.afterEach(() => {
    sinon.restore()
    createCommentStub.reset()
  })

  await t.test(
    'should not call createComment if no linked issues',
    async () => {
      const releaseNotes = `
      ## What's Changed\n +
      * chore 15 by @people in https://github.com/owner/repo/pull/13\n
      * chore 18 by @people in https://github.com/owner/repo/pull/15\n
      * chore 19 by @people in https://github.com/owner/repo/pull/16\n
      \n
      \n
      **Full Changelog**: https://github.com/owner/repo/compare/v1.0.20...v1.1.0
    `

      const release = { body: releaseNotes, html_url: 'some_url' }

      await notifyIssues(DEFAULT_GITHUB_CLIENT, false, 'owner', 'repo', release)

      assert.strictEqual(createCommentStub.called, false)
    }
  )

  await t.test(
    'should not call createComment if linked issue belongs to external repo',
    async () => {
      const releaseNotes = `
      ## What's Changed\n +
      * chore 15 by @people in https://github.com/owner/repo/pull/13\n
      \n
      \n
      **Full Changelog**: https://github.com/owner/repo/compare/v1.0.20...v1.1.0
    `

      const release = { body: releaseNotes, html_url: 'some_url' }

      const graphqlStub = sinon.stub().resolves({
        repository: {
          pullRequest: {
            closingIssuesReferences: {
              nodes: [
                {
                  number: '13',
                  repository: {
                    name: 'ext-repo',
                    owner: { login: 'ext-owner' },
                  },
                },
              ],
            },
          },
        },
      })

      await notifyIssues(
        { ...DEFAULT_GITHUB_CLIENT, graphql: graphqlStub },
        false,
        'owner',
        'repo',
        release
      )

      assert.strictEqual(createCommentStub.called, false)
    }
  )

  await t.test(
    'should call createComment with correct arguments for linked issues with npm link',
    async () => {
      const releaseNotes = `
      ## What's Changed\n +
      * chore 15 by @people in https://github.com/owner/repo/pull/13\n
      \n
      \n
      **Full Changelog**: https://github.com/owner/repo/compare/v1.0.20...v1.1.0
    `

      const release = { body: releaseNotes, html_url: 'some_url' }

      const graphqlStub = sinon.stub().resolves({
        repository: {
          pullRequest: {
            closingIssuesReferences: {
              nodes: [
                {
                  number: '10',
                  repository: {
                    name: 'repo',
                    owner: { login: 'owner' },
                  },
                },
                {
                  number: '15',
                  repository: {
                    name: 'repo',
                    owner: { login: 'owner' },
                  },
                },
              ],
            },
          },
        },
      })

      await notifyIssues(
        { ...DEFAULT_GITHUB_CLIENT, graphql: graphqlStub },
        true,
        'owner',
        'repo',
        release
      )

      const expectedCommentBody = `🎉 This issue has been resolved in version 1.0.0 🎉


  The release is available on:
  * [npm package](https://www.npmjs.com/package/packageName/v/1.0.0)
  * [GitHub release](some_url)


  Your **[optic](https://github.com/nearform-actions/optic-release-automation-action)** bot 📦🚀`

      assert.deepStrictEqual(createCommentStub.firstCall.args[0], {
        owner: 'owner',
        repo: 'repo',
        issue_number: '10',
        body: expectedCommentBody,
      })

      assert.deepStrictEqual(createCommentStub.secondCall.args[0], {
        owner: 'owner',
        repo: 'repo',
        issue_number: '15',
        body: expectedCommentBody,
      })
    }
  )

  await t.test(
    'should call createComment with correct arguments for linked issues without npm link',
    async () => {
      const releaseNotes = `
      ## What's Changed\n +
      * chore 15 by @people in https://github.com/owner/repo/pull/13\n
      \n
      \n
      **Full Changelog**: https://github.com/owner/repo/compare/v1.0.20...v1.1.0
    `

      const release = { body: releaseNotes, html_url: 'some_url' }

      const graphqlStub = sinon.stub().resolves({
        repository: {
          pullRequest: {
            closingIssuesReferences: {
              nodes: [
                {
                  number: '10',
                  repository: {
                    name: 'repo',
                    owner: { login: 'owner' },
                  },
                },
                {
                  number: '15',
                  repository: {
                    name: 'repo',
                    owner: { login: 'owner' },
                  },
                },
              ],
            },
          },
        },
      })

      await notifyIssues(
        { ...DEFAULT_GITHUB_CLIENT, graphql: graphqlStub },
        false,
        'owner',
        'repo',
        release
      )

      const expectedCommentBody = `🎉 This issue has been resolved in version 1.0.0 🎉


  The release is available on:
  * [GitHub release](some_url)


  Your **[optic](https://github.com/nearform-actions/optic-release-automation-action)** bot 📦🚀`

      assert.deepStrictEqual(createCommentStub.firstCall.args[0], {
        owner: 'owner',
        repo: 'repo',
        issue_number: '10',
        body: expectedCommentBody,
      })

      assert.deepStrictEqual(createCommentStub.secondCall.args[0], {
        owner: 'owner',
        repo: 'repo',
        issue_number: '15',
        body: expectedCommentBody,
      })
    }
  )

  await t.test(
    "shouldn't fail if createComment on an issue fails",
    async () => {
      const releaseNotes = `
      ## What's Changed\n +
      * chore 15 by @people in https://github.com/owner/repo/pull/13\n
      \n
      \n
      **Full Changelog**: https://github.com/owner/repo/compare/v1.0.20...v1.1.0
    `

      const release = { body: releaseNotes, html_url: 'some_url' }

      const graphqlStub = sinon.stub().resolves({
        repository: {
          pullRequest: {
            closingIssuesReferences: {
              nodes: [
                {
                  number: '10',
                  repository: {
                    name: 'repo',
                    owner: { login: 'owner' },
                  },
                },
                {
                  number: '15',
                  repository: {
                    name: 'repo',
                    owner: { login: 'owner' },
                  },
                },
              ],
            },
          },
        },
      })

      createCommentStub.rejects()

      await assert.doesNotReject(
        notifyIssues(
          { ...DEFAULT_GITHUB_CLIENT, graphql: graphqlStub },
          true,
          'owner',
          'repo',
          release
        )
      )
    }
  )
})
