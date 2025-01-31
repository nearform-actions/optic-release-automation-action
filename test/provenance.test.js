'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const sinon = require('sinon')
const semver = require('semver')
const {
  getProvenanceOptions,
  checkIsSupported,
  checkPermissions,
  getNpmVersion,
  // getAccessAdjustment needs proxyquire to mock internal package.json getter results
} = require('../src/utils/provenance')

const MINIMUM_VERSION = '9.5.0'
const setup = ({ t, local, published }) => {
  const packageInfoMock = t.mock.module('../src/utils/packageInfo.js', {
    namedExports: {
      getPublishedInfo: async () => published,
      getLocalInfo: () => local,
    },
  })

  const provenance = require('../src/utils/provenance')
  return {
    getAccessAdjustment: provenance.getAccessAdjustment,
    getProvenanceOptions: provenance.getProvenanceOptions,
    mocks: { packageInfoMock },
  }
}

test('provenance tests', async t => {
  t.beforeEach(() => {
    delete require.cache[require.resolve('../src/utils/provenance')]
  })

  t.afterEach(() => {
    sinon.restore()
  })

  const unscopedPackageName = 'unscoped-fake-package'
  const scopedPackageName = '@scoped/fake-package'

  await t.test('getNpmVersion can get a real NPM version number', async () => {
    // const { getNpmVersion } = require('../src/utils/provenance')
    const npmVersion = await getNpmVersion()
    assert.equal(typeof npmVersion, 'string')
    assert.ok(semver.satisfies(npmVersion, '>0.0.1'))
  })

  await t.test('checkIsSupported passes on minimum NPM version', async () => {
    assert.doesNotThrow(() => checkIsSupported(MINIMUM_VERSION))
  })

  await t.test(
    'checkIsSupported passes on major version after minimum',
    async () => {
      assert.doesNotThrow(() => checkIsSupported('10.0.0'))
    }
  )

  await t.test(
    'checkIsSupported fails on minor version before minimum',
    async () => {
      assert.throws(
        () => checkIsSupported('9.4.0'),
        err => {
          return err.message.includes('Provenance requires NPM >=9.5.0')
        }
      )
    }
  )

  await t.test(
    'checkIsSupported fails on major version before minimum',
    async () => {
      assert.throws(
        () => checkIsSupported('8.0.0'),
        err => {
          return err.message.includes('Provenance requires NPM >=9.5.0')
        }
      )
    }
  )

  await t.test('checkPermissions always passes on NPM 9.6.1', async () => {
    assert.doesNotThrow(() => checkIsSupported('9.6.1'))
  })

  await t.test(
    'checkPermissions always passes on next major NPM version',
    async () => {
      assert.doesNotThrow(() => checkIsSupported('10.0.0'))
    }
  )

  await t.test(
    'checkPermissions fails on minimum version without env',
    async () => {
      assert.throws(
        () => checkPermissions(MINIMUM_VERSION),
        /Provenance generation in GitHub Actions requires "write" access to the "id-token" permission/
      )
    }
  )

  await t.test(
    'checkPermissions passes on minimum version with env',
    async () => {
      sinon
        .stub(process, 'env')
        .value({ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' })
      assert.doesNotThrow(() => checkIsSupported(MINIMUM_VERSION))
    }
  )

  await t.test(
    'getAccessAdjustment returns { access: public } if unscoped, unpublished and no access option',
    async t => {
      const { getAccessAdjustment, mocks } = setup({
        t,
        local: { name: unscopedPackageName },
        published: null,
      })
      assert.deepEqual(await getAccessAdjustment(), { access: 'public' })
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'getAccessAdjustment does nothing if passed defined access option',
    async t => {
      const { getAccessAdjustment, mocks } = setup({
        t,
        local: { name: unscopedPackageName },
        published: null,
      })
      assert.equal(await getAccessAdjustment({ access: 'public' }), undefined)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'getAccessAdjustment does nothing if package.json defines access',
    async t => {
      const { getAccessAdjustment, mocks } = setup({
        t,
        local: {
          name: unscopedPackageName,
          publishConfig: { access: 'public ' },
        },
        published: null,
      })
      assert.equal(await getAccessAdjustment(), undefined)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'getAccessAdjustment does nothing if package.json name is scoped',
    async t => {
      const { getAccessAdjustment, mocks } = setup({
        t,
        local: { name: scopedPackageName },
        published: null,
      })
      assert.equal(await getAccessAdjustment(), undefined)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'getAccessAdjustment does nothing if package is on npm',
    async t => {
      const { getAccessAdjustment, mocks } = setup({
        t,
        local: { name: unscopedPackageName },
        published: { name: unscopedPackageName },
      })
      assert.equal(await getAccessAdjustment(), undefined)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'getProvenanceOptions fails fast if NPM version unavailable',
    async () => {
      await assert.rejects(
        getProvenanceOptions,
        /Current npm version not provided/
      )
    }
  )

  await t.test(
    'getProvenanceOptions returns extra options when all checks pass',
    async t => {
      const { getProvenanceOptions, mocks } = setup({
        t,
        local: { name: 'unscoped-package' },
        published: null,
      })

      sinon
        .stub(process, 'env')
        .value({ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' })

      const publishOptions = { someOption: 'value' }
      const result = await getProvenanceOptions('9.6.0', publishOptions)
      assert.deepEqual(result, { access: 'public' })
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )

  await t.test(
    'getProvenanceOptions succeeds with npm version and no publish options',
    async t => {
      const { getProvenanceOptions, mocks } = setup({
        t,
        local: { name: '@scoped/package' }, // Scoped package won't return access option
        published: null,
      })

      sinon
        .stub(process, 'env')
        .value({ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.com' })

      const result = await getProvenanceOptions('9.6.0')
      assert.equal(result, undefined)
      Object.values(mocks).forEach(mock => mock.restore())
    }
  )
})
