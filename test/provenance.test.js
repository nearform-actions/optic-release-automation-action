'use strict'

const { describe, it, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const semver = require('semver')
const {
  getProvenanceOptions,
  checkIsSupported,
  checkPermissions,
  getNpmVersion,
} = require('../src/utils/provenance')
const { mockModule } = require('./mockModule.js')

const MINIMUM_VERSION = '9.5.0'
const unscopedPackageName = 'unscoped-fake-package'
const scopedPackageName = '@scoped/fake-package'

const setupAccessAdjustment = ({ local, published }) => {
  const { getAccessAdjustment } = mockModule('../src/utils/provenance.js', {
    '../src/utils/packageInfo.js': {
      namedExports: {
        getPublishedInfo: async () => published,
        getLocalInfo: () => local,
      },
    },
  })
  return getAccessAdjustment
}

describe('provenance tests', async () => {
  afterEach(() => {
    sinon.restore()
  })

  it('getNpmVersion can get a real NPM version number', async () => {
    const npmVersion = await getNpmVersion()
    assert.strictEqual(typeof npmVersion, 'string')
    assert.ok(semver.satisfies(npmVersion, '>0.0.1'))
  })

  it('checkIsSupported passes on minimum NPM version', async () => {
    assert.doesNotThrow(() => checkIsSupported(MINIMUM_VERSION))
  })

  it('checkIsSupported passes on major version after minimum', async () => {
    assert.doesNotThrow(() => checkIsSupported('10.0.0'))
  })

  it('checkIsSupported fails on minor version before minimum', async () => {
    assert.throws(
      () => checkIsSupported('9.4.0'),
      err => {
        return err.message.includes('Provenance requires NPM >=9.5.0')
      }
    )
  })

  it('checkIsSupported fails on major version before minimum', async () => {
    assert.throws(
      () => checkIsSupported('8.0.0'),
      err => {
        return err.message.includes('Provenance requires NPM >=9.5.0')
      }
    )
  })

  it('checkPermissions always passes on NPM 9.6.1', async () => {
    assert.doesNotThrow(() => checkIsSupported('9.6.1'))
  })

  it('checkPermissions always passes on next major NPM version', async () => {
    assert.doesNotThrow(() => checkIsSupported('10.0.0'))
  })

  it('checkPermissions fails on minimum version without env', async () => {
    assert.throws(
      () => checkPermissions(MINIMUM_VERSION),
      /Provenance generation in GitHub Actions requires "write" access to the "id-token" permission/
    )
  })

  it('checkPermissions passes on minimum version with env', async () => {
    sinon
      .stub(process, 'env')
      .value({ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' })
    assert.doesNotThrow(() => checkIsSupported(MINIMUM_VERSION))
  })

  it('getAccessAdjustment returns { access: public } if unscoped, unpublished and no access option', async () => {
    const getAccessAdjustment = setupAccessAdjustment({
      local: { name: unscopedPackageName },
      published: null,
    })
    assert.deepStrictEqual(await getAccessAdjustment(), { access: 'public' })
  })

  it('getAccessAdjustment does nothing if passed defined access option', async () => {
    const getAccessAdjustment = setupAccessAdjustment({
      local: { name: unscopedPackageName },
      published: null,
    })
    assert.strictEqual(
      await getAccessAdjustment({ access: 'public' }),
      undefined
    )
  })

  it('getAccessAdjustment does nothing if package.json defines access', async () => {
    const getAccessAdjustment = setupAccessAdjustment({
      local: {
        name: unscopedPackageName,
        publishConfig: { access: 'public ' },
      },
      published: null,
    })
    assert.strictEqual(await getAccessAdjustment(), undefined)
  })

  it('getAccessAdjustment does nothing if package.json name is scoped', async () => {
    const getAccessAdjustment = setupAccessAdjustment({
      local: { name: scopedPackageName },
      published: null,
    })
    assert.strictEqual(await getAccessAdjustment(), undefined)
  })

  it('getAccessAdjustment does nothing if package is on npm', async () => {
    const getAccessAdjustment = setupAccessAdjustment({
      local: { name: unscopedPackageName },
      published: { name: unscopedPackageName },
    })
    assert.strictEqual(await getAccessAdjustment(), undefined)
  })

  it('getProvenanceOptions fails fast if NPM version unavailable', async () => {
    await assert.rejects(
      getProvenanceOptions,
      /Current npm version not provided/
    )
  })

  it('getProvenanceOptions returns extra options when all checks pass', async () => {
    const getAccessAdjustment = setupAccessAdjustment({
      local: { name: 'unscoped-package' },
      published: null,
    })

    sinon
      .stub(process, 'env')
      .value({ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' })

    const publishOptions = { someOption: 'value' }
    const result = await getAccessAdjustment('9.6.0', publishOptions)
    assert.deepStrictEqual(result, { access: 'public' })
  })

  it('getProvenanceOptions succeeds with npm version and no publish options', async () => {
    const getProvenanceOptions = setupAccessAdjustment({
      local: { name: '@scoped/package' }, // Scoped package won't return access option
      published: null,
    })

    sinon
      .stub(process, 'env')
      .value({ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' })

    const result = await getProvenanceOptions('9.6.0')
    assert.strictEqual(result, undefined)
  })

  it('getProvenanceOptions returns whatever getAccessAdjustment returns', async () => {
    const getProvenanceOptions = mockModule('../src/utils/provenance.js', {
      '../src/utils/packageInfo.js': {
        namedExports: {
          getPublishedInfo: async () => null,
          getLocalInfo: () => ({ name: 'unscoped-package' }),
        },
      },
    }).getProvenanceOptions

    sinon
      .stub(process, 'env')
      .value({ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' })
    const result = await getProvenanceOptions('9.6.1', {})
    assert.deepStrictEqual(result, { access: 'public' })
  })
})
