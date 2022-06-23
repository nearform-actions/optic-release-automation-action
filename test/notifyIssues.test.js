'use strict'

// const fs = require('fs')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const tap = require('tap')

const actionLog = require('../src/log')
// const { notifyIssues } = require('../src/utils/notifyIssues')

let pullsGetStub = sinon.stub()
let createCommentStub = sinon.stub()

const githubClientStub = {
  rest: {
    issues: { createComment: createCommentStub },
    pulls: { get: pullsGetStub },
  },
}

function setup() {
  const logStub = sinon.stub(actionLog)
  // const fsStub = sinon
  //   .stub(fs, 'readFileSync')
  //   .resolves("{ 'name': 'packageName', 'version': '1.0.0'}")

  // const fsStub = sinon
  //   .stub(fs, 'readFileSync')
  //   .withArgs('./package.json', 'utf8')
  //   .returns('{ "name": "packageName", "version": "1.0.0"}')

  const readFileSyncStub = sinon
    .stub()
    .withArgs('./package.json', 'utf8')
    .returns('{ "name": "packageName", "version": "1.0.0"}')

  const notifyIssues = proxyquire('../src/utils/notifyIssues', {
    fs: { readFileSync: readFileSyncStub },
  })

  return { notifyIssues, stubs: { logStub } }
}

tap.afterEach(() => {
  sinon.restore()
})

tap.test('Should call createComment with correct arguments', async () => {
  const { notifyIssues } = setup()

  const releaseNotes =
    "## What's Changed\n" +
    '* chore 15 by @people in https://github.com/owner/repo/pull/13\n' +
    '* chore 18 by @people in https://github.com/owner/repo/pull/15\n' +
    '* chore 19 by @people in https://github.com/owner/repo/pull/16\n' +
    '\n' +
    '\n' +
    '**Full Changelog**: https://github.com/owner/repo/compare/v1.0.20...v1.1.0'

  const release = { body: releaseNotes, html_url: 'some_url' }

  notifyIssues(githubClientStub, 'owner', 'repo', release)
})
