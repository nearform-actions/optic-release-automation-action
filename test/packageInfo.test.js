'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const sinon = require('sinon')
const { getLocalInfo, getPublishedInfo } = require('../src/utils/packageInfo')

const mockPackageInfo = {
  name: 'some-package-name',
  license: 'some-license',
  publishConfig: {
    access: 'restricted',
  },
}

const setupPublished = ({
  t,
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

  const execMock = t.mock.module('../src/utils/execWithOutput.js', {
    namedExports: {
      execWithOutput: execWithOutputStub,
    },
  })

  const packageInfo = require('../src/utils/packageInfo.js')
  return { packageInfo, mocks: { execMock } }
}

const setupLocal = ({ t, value = JSON.stringify(mockPackageInfo) } = {}) => {
  const readFileSyncStub = sinon
    .stub()
    .withArgs('./package.json', 'utf8')
    .returns(value)

  const fsMock = t.mock.module('fs', {
    namedExports: {
      readFileSync: readFileSyncStub,
    },
  })

  const packageInfo = require('../src/utils/packageInfo')
  return { packageInfo, mocks: { fsMock } }
}

test('packageInfo tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/utils/packageInfo')]
  })

  t.afterEach(() => {
    sinon.restore()
  })

  await t.test(
    'getPublishedInfo does not get any info for this package',
    async () => {
      const info = await getPublishedInfo()
      assert.equal(info, null)
    }
  )

  await t.test('getPublishedInfo parses any valid JSON it finds', async t => {
    const { packageInfo, mocks } = setupPublished({ t })
    const info = await packageInfo.getPublishedInfo()
    assert.deepEqual(info, mockPackageInfo)
    Object.values(mocks).forEach(mock => mock.restore())
  })

  await t.test(
    'getPublishedInfo continues and returns null if the request 404s',
    async t => {
      const { packageInfo, mocks } = setupPublished({
        t,
        value: JSON.stringify(mockPackageInfo),
        error: new Error('code E404 - package not found'),
      })
      const info = await packageInfo.getPublishedInfo()
      assert.equal(info, null)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'getPublishedInfo throws if it encounters an internal error',
    async t => {
      const { packageInfo, mocks } = setupPublished({
        t,
        value: "[{ 'this:' is not ] valid}j.s.o.n()",
      })
      await assert.rejects(packageInfo.getPublishedInfo, /JSON/)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'getPublishedInfo continues and returns null if the request returns null',
    async t => {
      const { packageInfo, mocks } = setupPublished({
        t,
        value: null,
      })
      const info = await packageInfo.getPublishedInfo()
      assert.equal(info, null)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'getPublishedInfo throws if it hits a non-404 error',
    async t => {
      const { packageInfo, mocks } = setupPublished({
        t,
        error: new Error('code E418 - unexpected teapot'),
      })
      await assert.rejects(packageInfo.getPublishedInfo, /teapot/)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'getLocalInfo gets real name and stable properties of this package',
    async () => {
      const info = getLocalInfo()
      assert.equal(info.name, 'optic-release-automation-action')
      assert.equal(info.license, 'MIT')
    }
  )

  await t.test(
    'getLocalInfo gets data from stringified JSON from file',
    async t => {
      const { packageInfo, mocks } = setupLocal({ t })
      const info = packageInfo.getLocalInfo()
      assert.deepEqual(info, mockPackageInfo)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )
})
