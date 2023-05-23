'use strict'
const tap = require('tap')
const sinon = require('sinon')
const proxyquire = require('proxyquire')

const {
  getLocalInfo,
  getPublishedInfo,
} = require('../src/utils/packageInfo') 


const mockPackageInfo = {
  name: 'some-package-name',
  license: 'some-license',
  publishConfig: {
    access: 'restricted'
  }
}

const setupPublished = ({ value = JSON.stringify(mockPackageInfo), error } = {}) => {
  const execWithOutputStub = sinon.stub()
  const args = ['npm', ['view', '--json']]

  if (value) {
    execWithOutputStub
      .withArgs(...args)
      .returns(value)
  }
  if (error) {
    execWithOutputStub
      .withArgs(...args)
      .throws(error)
  }

  return proxyquire('../src/utils/packageInfo', {
    './execWithOutput': { execWithOutput: execWithOutputStub },
  })
}

const setupLocal = ({ value = JSON.stringify(mockPackageInfo) } = {}) => {
  const readFileSyncStub = sinon
    .stub()
    .withArgs('./package.json', 'utf8')
    .returns(value)

  return proxyquire('../src/utils/packageInfo', {
      fs: { readFileSync: readFileSyncStub },
    })
}

tap.test('getPublishedInfo does not get any info for this package', async t => {
  // Check it works for real: this package is a Github Action, not published on NPM, so expect null
  const packageInfo = await getPublishedInfo()
  t.notOk(packageInfo)
})

tap.test('getPublishedInfo parses any valid JSON it finds', async t => {
  const mocks = setupPublished()
  
  const packageInfo = await mocks.getPublishedInfo()
  t.match(packageInfo, mockPackageInfo)
})

tap.test('getPublishedInfo continues and returns null if the request 404s', async t => {
  const mocks = setupPublished({
    value: JSON.stringify(mockPackageInfo),
    error: new Error('code E404 - package not found')
  })
  
  const packageInfo = await mocks.getPublishedInfo()
  t.match(packageInfo, null)
})

tap.test('getPublishedInfo throws if it encounters an internal error', async t => {
  const mocks = setupPublished({
    value: "[{ 'this:' is not ] valid}j.s.o.n()",
  })

  t.rejects(mocks.getPublishedInfo, /JSON/)
})

tap.test('getPublishedInfo continues and returns null if the request returns null', async t => {
  const mocks = setupPublished({
    value: null,
  })
  
  const packageInfo = await mocks.getPublishedInfo()
  t.match(packageInfo, null)
})

tap.test('getPublishedInfo throws if it hits a non-404 error', async t => {
  const mocks = setupPublished({
    error: new Error('code E418 - unexpected teapot')
  })

  t.rejects(mocks.getPublishedInfo, /teapot/)
})

tap.test('getLocalInfo gets real name and stable properties of this package', async t => {
  const packageInfo = getLocalInfo()
  // Check it works for real using real package.json properties that are stable
  t.equal(packageInfo.name, 'optic-release-automation-action')
  t.equal(packageInfo.license, 'MIT')
})

tap.test('getLocalInfo gets data from stringified JSON from file', async t => {
  const mocks = setupLocal()
  const packageInfo = mocks.getLocalInfo()
  t.match(packageInfo, mockPackageInfo)
})
