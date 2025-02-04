'use strict'

const { afterEach, describe, it } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const { getLocalInfo, getPublishedInfo } = require('../src/utils/packageInfo')
const { mockModule } = require('./mockModule.js')

const mockPackageInfo = {
  name: 'some-package-name',
  license: 'some-license',
  publishConfig: {
    access: 'restricted',
  },
}

const setupPublished = ({
  value = JSON.stringify(mockPackageInfo),
  error,
} = {}) => {
  const execWithOutputStub = sinon.stub()
  const args = ['npm', ['view', '--json']]

  if (value) {
    execWithOutputStub.withArgs(...args).returns(value)
  }
  if (error) {
    execWithOutputStub.withArgs(...args).throws(error)
  }

  return mockModule('../src/utils/packageInfo', {
    '../src/utils/execWithOutput.js': {
      namedExports: {
        execWithOutput: execWithOutputStub,
      },
    },
  })
}

const setupLocal = ({ value = JSON.stringify(mockPackageInfo) } = {}) => {
  const readFileSyncStub = sinon
    .stub()
    .withArgs('./package.json', 'utf8')
    .returns(value)

  return mockModule('../src/utils/packageInfo.js', {
    fs: {
      namedExports: {
        readFileSync: readFileSyncStub,
      },
    },
  })
}

describe('packageInfo tests', async () => {
  afterEach(() => {
    sinon.restore()
  })

  it('getPublishedInfo does not get any info for this package', async () => {
    const info = await getPublishedInfo()
    assert.strictEqual(info, null)
  })

  it('getPublishedInfo parses any valid JSON it finds', async () => {
    const packageInfo = setupPublished()
    const info = await packageInfo.getPublishedInfo()
    assert.deepStrictEqual(info, mockPackageInfo)
  })

  it('getPublishedInfo continues and returns null if the request 404s', async () => {
    const packageInfo = setupPublished({
      value: JSON.stringify(mockPackageInfo),
      error: new Error('code E404 - package not found'),
    })
    const info = await packageInfo.getPublishedInfo()
    assert.strictEqual(info, null)
  })

  it('getPublishedInfo throws if it encounters an internal error', async () => {
    const packageInfo = setupPublished({
      value: "[{ 'this:' is not ] valid}j.s.o.n()",
    })
    await assert.rejects(packageInfo.getPublishedInfo, /JSON/)
  })

  it('getPublishedInfo continues and returns null if the request returns null', async () => {
    const packageInfo = setupPublished({
      value: null,
    })
    const info = await packageInfo.getPublishedInfo()
    assert.strictEqual(info, null)
  })

  it('getPublishedInfo throws if it hits a non-404 error', async () => {
    const packageInfo = setupPublished({
      error: new Error('code E418 - unexpected teapot'),
    })
    await assert.rejects(packageInfo.getPublishedInfo, /teapot/)
  })

  it('getLocalInfo gets real name and stable properties of this package', async () => {
    const info = getLocalInfo()
    assert.strictEqual(info.name, 'optic-release-automation-action')
    assert.strictEqual(info.license, 'MIT')
  })

  it('getLocalInfo gets data from stringified JSON from file', async () => {
    const packageInfo = setupLocal()
    const info = packageInfo.getLocalInfo()
    assert.deepStrictEqual(info, mockPackageInfo)
  })
})
