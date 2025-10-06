'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const _template = require('lodash.template')
const fs = require('fs')
const path = require('path')

const {
  getPrNumbersFromReleaseNotes,
  getPRBody,
} = require('../src/utils/releaseNotes')

describe('releaseNotes tests', async () => {
  it('Should return the correct PR numbers', async () => {
    const testReleaseNotes = `
     ## Whats Changed\n +
     * chore 15 by @people in https://github.com/owner/repo/pull/13\n
     * chore 18 by @people in https://github.com/owner/repo/pull/15\n
     * chore 19 by @people in https://github.com/owner/repo/pull/16\n
     * chore 21 by @people in https://github.com/owner/repo/pull/18\n
     * fix 26 by @people in https://github.com/owner/repo/pull/42\n
     * feature 30 by @people in https://github.com/owner/repo/pull/50\n
     * fix 27 by @people in https://github.com/owner/repo/pull/52\n
     * fix 32 by @people in https://github.com/owner/repo/pull/53\n
     \n
     \n
     ## New Contributors\n
     * @people made their first contribution in https://github.com/owner/repo/pull/13\n
     * @people made their first contribution in https://github.com/owner/repo/pull/16\n
     * @people made their first contribution in https://github.com/owner/repo/pull/42\n
     * @people made their first contribution in https://github.com/owner/repo/pull/53\n
     \n
     \n
     ## New documentation\n
     * Link: https://somewhere.com/on/the/internet
     \n
     \n
     **Full Changelog**: https://github.com/owner/repo/compare/v1.0.20...v1.1.0
   `

    const result = getPrNumbersFromReleaseNotes(testReleaseNotes)
    const expected = ['13', '15', '16', '18', '42', '50', '52', '53']

    assert.deepStrictEqual(result, expected)
  })

  it('Should return truncated PR body', async () => {
    const tpl = fs.readFileSync(path.join(__dirname, '../src/pr.tpl'), 'utf8')

    const testReleaseNotes = `
     ## Whats Changed\n +
     * chore 15 by @people in https://github.com/owner/repo/pull/13\n
     * chore 18 by @people in https://github.com/owner/repo/pull/15\n
     * chore 19 by @people in https://github.com/owner/repo/pull/16\n
     * chore 21 by @people in https://github.com/owner/repo/pull/18\n
     * fix 26 by @people in https://github.com/owner/repo/pull/42\n
     * feature 30 by @people in https://github.com/owner/repo/pull/50\n
     * fix 27 by @people in https://github.com/owner/repo/pull/52\n
     * fix 32 by @people in https://github.com/owner/repo/pull/53\n
     \n
     \n
     ## New Contributors\n
     * @people made their first contribution in https://github.com/owner/repo/pull/13\n
     * @people made their first contribution in https://github.com/owner/repo/pull/16\n
     * @people made their first contribution in https://github.com/owner/repo/pull/42\n
     * @people made their first contribution in https://github.com/owner/repo/pull/53\n
     \n
     \n
     ## New documentation\n
     * Link: https://somewhere.com/on/the/internet
     \n
     \n
     **Full Changelog**: https://github.com/owner/repo/compare/v1.0.20...v1.1.0
   `

    let longPrBody = testReleaseNotes
    for (let i = 0; i < 70; i++) {
      longPrBody = longPrBody + testReleaseNotes
    }

    assert.ok(longPrBody.length > 60000)

    const truncatedPrBody = getPRBody(_template(tpl), {
      newVersion: '1.0.0',
      draftRelease: { id: 1, body: longPrBody },
      inputs: [],
      author: 'test',
      artifact: null,
    })

    assert.ok(truncatedPrBody.length < 65536)
    assert.ok(
      truncatedPrBody.includes(
        `<release-meta>{"id":1,"version":"1.0.0"}</release-meta>`
      )
    )
  })

  it('Should detect npm publish when npm-token is provided', async () => {
    const tpl = fs.readFileSync(path.join(__dirname, '../src/pr.tpl'), 'utf8')

    const prBody = getPRBody(_template(tpl), {
      newVersion: '1.0.0',
      draftRelease: {
        id: 1,
        body: 'Test release notes',
        html_url: 'https://github.com/test/test/releases/1',
      },
      inputs: { 'npm-token': 'test-token', 'npm-tag': 'latest' },
      author: 'test',
      artifact: null,
    })

    assert.ok(
      prBody.includes('The npm package with tag latest will be published')
    )
    assert.ok(!prBody.includes('No npm package will be published'))
  })

  it('Should detect npm publish when publish-mode is oidc', async () => {
    const tpl = fs.readFileSync(path.join(__dirname, '../src/pr.tpl'), 'utf8')

    const prBody = getPRBody(_template(tpl), {
      newVersion: '1.0.0',
      draftRelease: {
        id: 1,
        body: 'Test release notes',
        html_url: 'https://github.com/test/test/releases/1',
      },
      inputs: { 'publish-mode': 'oidc', 'npm-tag': 'latest' },
      author: 'test',
      artifact: null,
    })

    assert.ok(
      prBody.includes('The npm package with tag latest will be published')
    )
    assert.ok(!prBody.includes('No npm package will be published'))
  })

  it('Should not detect npm publish when publish-mode is none', async () => {
    const tpl = fs.readFileSync(path.join(__dirname, '../src/pr.tpl'), 'utf8')

    const prBody = getPRBody(_template(tpl), {
      newVersion: '1.0.0',
      draftRelease: {
        id: 1,
        body: 'Test release notes',
        html_url: 'https://github.com/test/test/releases/1',
      },
      inputs: { 'publish-mode': 'none', 'npm-tag': 'latest' },
      author: 'test',
      artifact: null,
    })

    assert.ok(prBody.includes('No npm package will be published'))
    assert.ok(
      !prBody.includes('The npm package with tag latest will be published')
    )
  })

  it('Should not detect npm publish when no npm-token and no oidc mode', async () => {
    const tpl = fs.readFileSync(path.join(__dirname, '../src/pr.tpl'), 'utf8')

    const prBody = getPRBody(_template(tpl), {
      newVersion: '1.0.0',
      draftRelease: {
        id: 1,
        body: 'Test release notes',
        html_url: 'https://github.com/test/test/releases/1',
      },
      inputs: { 'npm-tag': 'latest' },
      author: 'test',
      artifact: null,
    })

    assert.ok(prBody.includes('No npm package will be published'))
    assert.ok(
      !prBody.includes('The npm package with tag latest will be published')
    )
  })
})
