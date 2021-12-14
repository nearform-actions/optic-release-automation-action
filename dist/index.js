/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 582:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const openPr = __nccwpck_require__(411)
const release = __nccwpck_require__(315)
const { logError } = __nccwpck_require__(261)

module.exports = async function ({ action, github, context, inputs }) {
  if (action === 'open_pr') {
    return openPr({ context, inputs })
  }

  if (action === 'release') {
    return release({ github, context, inputs })
  }

  logError('Unsupported event')
}


/***/ }),

/***/ 73:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


exports.PR_TITLE_PREFIX = '[OPTIC-RELEASE-AUTOMATION]'


/***/ }),

/***/ 261:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";


const { debug, error, info, warning } = __nccwpck_require__(396)

const stringify = msg =>
  typeof msg === 'string' ? msg : msg.stack || msg.toString()

const log = logger => message => logger(stringify(message))

exports.logDebug = log(debug)
exports.logError = log(error)
exports.logInfo = log(info)
exports.logWarning = log(warning)


/***/ }),

/***/ 411:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const fs = __nccwpck_require__(147)
const path = __nccwpck_require__(17)
const _template = __nccwpck_require__(200)
const semver = __nccwpck_require__(923)

const { PR_TITLE_PREFIX } = __nccwpck_require__(73)
const { runSpawn } = __nccwpck_require__(914)
const { callApi } = __nccwpck_require__(720)

const actionPath = process.env.GITHUB_ACTION_PATH
const tpl = fs.readFileSync(path.join(actionPath, 'pr.tpl'), 'utf8')

const getPRBody = (template, { newVersion, draftRelease, inputs }) => {
  const tagsToBeUpdated = []
  const { major, minor } = semver.parse(newVersion)

  if (major !== 0) tagsToBeUpdated.push(`v${major}`)
  if (minor !== 0) tagsToBeUpdated.push(`v${major}.${minor}`)

  // Should strictly contain only non-sensitive data
  const releaseMeta = {
    id: draftRelease.id,
    version: newVersion,
    npmTag: inputs['npm-tag'],
    opticUrl: inputs['optic-url'],
  }

  return template({
    releaseMeta,
    draftRelease,
    tagsToUpdate: tagsToBeUpdated.join(', '),
    npmPublish: !!inputs['npm-token'],
    syncTags: /true/i.test(inputs['sync-semver-tags']),
  })
}

module.exports = async function ({ context, inputs }) {
  const run = runSpawn()

  const newVersion = process.env.NPM_VERSION
  if (!newVersion) {
    throw new Error('Env var NPM_VERSION is not set!')
  }

  const branchName = `release/${newVersion}`

  await run('git', ['checkout', '-b', branchName])
  await run('git', ['add', '-A'])
  await run('git', ['commit', '-m', newVersion])
  await run('git', ['push', 'origin', branchName])

  const { data: draftRelease } = await callApi(
    {
      method: 'POST',
      endpoint: 'release',
      body: {
        version: newVersion,
      },
    },
    inputs
  )

  const prBody = getPRBody(_template(tpl), { newVersion, draftRelease, inputs })

  await callApi(
    {
      method: 'POST',
      endpoint: 'pr',
      body: {
        head: `refs/heads/${branchName}`,
        base: context.payload.ref,
        title: `${PR_TITLE_PREFIX} ${branchName}`,
        body: prBody,
      },
    },
    inputs
  )
}


/***/ }),

/***/ 315:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { PR_TITLE_PREFIX } = __nccwpck_require__(73)
const semver = __nccwpck_require__(923)
const core = __nccwpck_require__(396)

const { callApi } = __nccwpck_require__(720)
const { tagVersionInGit } = __nccwpck_require__(405)
const { runSpawn } = __nccwpck_require__(914)
const { logError } = __nccwpck_require__(261)

module.exports = async function ({ github, context, inputs }) {
  const pr = context.payload.pull_request
  const owner = context.repo.owner
  const repo = context.repo.repo

  if (
    context.payload.action !== 'closed' ||
    pr.user.login !== 'optic-release-automation[bot]' ||
    !pr.title.startsWith(PR_TITLE_PREFIX)
  ) {
    return
  }

  let releaseMeta
  try {
    releaseMeta = JSON.parse(
      pr.body.substring(
        pr.body.indexOf('<release-meta>') + 14,
        pr.body.lastIndexOf('</release-meta>')
      )
    )
  } catch (err) {
    return logError(err)
  }

  const { opticUrl, npmTag, version, id } = releaseMeta

  const run = runSpawn()
  if (!pr.merged) {
    const branchName = `release/${version}`
    const promises = await Promise.allSettled([
      run('git', ['push', 'origin', '--delete', branchName]),
      github.rest.repos.deleteRelease({
        owner,
        repo,
        release_id: id,
      }),
    ])

    const errors = promises.filter(p => p.reason).map(p => p.reason.message)
    if (errors.length) {
      core.setFailed(
        `Something went wrong while deleting the branch or release. \n Errors: ${errors.join(
          '\n'
        )}`
      )
    }

    // Return early after an attempt at deleting the branch and release
    return
  }

  const opticToken = inputs['optic-token']

  if (inputs['npm-token']) {
    await run('npm', ['pack', '--dry-run'])
    if (opticToken) {
      const otp = await run('curl', ['-s', `${opticUrl}${opticToken}`])
      await run('npm', ['publish', '--otp', otp, '--tag', npmTag])
    } else {
      await run('npm', ['publish', '--tag', npmTag])
    }
  }

  try {
    const syncVersions = /true/i.test(inputs['sync-semver-tags'])

    if (syncVersions) {
      const { major, minor } = semver.parse(version)

      if (major !== 0) await tagVersionInGit(`v${major}`)
      if (minor !== 0) await tagVersionInGit(`v${major}.${minor}`)
    }
  } catch (err) {
    core.setFailed(`Unable to update the semver tags ${err.message}`)
  }

  // TODO: What if PR was closed, reopened and then merged. The draft release would have been deleted!
  try {
    await callApi(
      {
        endpoint: 'release',
        method: 'PATCH',
        body: {
          version: version,
          releaseId: id,
        },
      },
      inputs
    )
  } catch (err) {
    core.setFailed(`Unable to publish the release ${err.message}`)
  }
}


/***/ }),

/***/ 720:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";


const fetch = __nccwpck_require__(464)
const { logWarning } = __nccwpck_require__(261)

const GITHUB_APP_URL = 'https://github.com/apps/optic-release-automation'

// Github does not allow a new workflow run to be triggered as a result of an action using the same `GITHUB_TOKEN`.
// Hence all write ops are being done via an external GitHub app.
const callApi = async ({ method, endpoint, body }, inputs) => {
  const response = await fetch(`${inputs['api-url']}${endpoint}`, {
    method,
    headers: {
      authorization: `token ${inputs['github-token']}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (response.status !== 200) {
    logWarning(`Please ensure that Github App is installed ${GITHUB_APP_URL}`)
  }

  return response.json()
}

exports.callApi = callApi


/***/ }),

/***/ 914:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";


const { spawn } = __nccwpck_require__(81)

function runSpawn({ cwd } = {}) {
  return (cmd, args) => {
    return new Promise((resolve, reject) => {
      const cli = spawn(cmd, args, { cwd, env: process.env, shell: true })
      cli.stdout.setEncoding('utf8')
      cli.stderr.setEncoding('utf8')

      let stdout = ''
      let stderr = ''
      cli.stdout.on('data', data => {
        stdout += data
      })
      cli.stderr.on('data', data => {
        stderr += data
      })
      cli.on('close', (code, signal) => {
        if (code === 0) {
          return resolve(stdout.trim())
        }
        reject(
          new Error(
            `${cmd} ${args.join(
              ' '
            )} returned code ${code} and signal ${signal}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`
          )
        )
      })
    })
  }
}

exports.runSpawn = runSpawn


/***/ }),

/***/ 405:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";

const { runSpawn } = __nccwpck_require__(914)

async function tagVersionInGit(version) {
  const run = runSpawn()

  await run('git', ['push', 'origin', `:refs/tags/${version}`])
  await run('git', ['tag', '-f', `"${version}"`])
  await run('git', ['push', 'origin', `--tags`])
}

exports.tagVersionInGit = tagVersionInGit


/***/ }),

/***/ 396:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 200:
/***/ ((module) => {

module.exports = eval("require")("lodash.template");


/***/ }),

/***/ 464:
/***/ ((module) => {

module.exports = eval("require")("node-fetch");


/***/ }),

/***/ 923:
/***/ ((module) => {

module.exports = eval("require")("semver");


/***/ }),

/***/ 81:
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 17:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(582);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;