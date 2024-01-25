'use strict'

const { StringDecoder } = require('node:string_decoder')

const { exec } = require('@actions/exec')
const { CONFIDENTIAL_KEYWORDS_FOR_REDACTION } = require('../const')

/**
 * 
 * @param {string[]} args 
 * @returns Redacted Array or Blank Array if null/undefined
 */
function removeConfidentialArguments(args) {
  let skipItem = false

  return (args ?? []).filter(arg => {
      if (skipItem) {
          skipItem = false
          
          return false;
      }

      skipItem = CONFIDENTIAL_KEYWORDS_FOR_REDACTION.includes(arg?.toString().toLocaleUpperCase())

      return !skipItem
  })
}

/**
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {{cwd?: string}} options
 * @returns Promise<string>
 */
async function execWithOutput(
  cmd,
  args,
  { cwd, silent = false, env = getFilteredEnv(), ...options } = {}
) {
  let output = ''
  let errorOutput = ''

  const stdoutDecoder = new StringDecoder('utf8')
  const stderrDecoder = new StringDecoder('utf8')

  options.silent = silent
  options.env = env

  /* istanbul ignore else */
  if (cwd !== '') {
    options.cwd = cwd
  }

  options.listeners = {
    /**
     *
     * @param {Buffer} data
     */
    stdout: data => {
      output += stdoutDecoder.write(data)
    },
    /**
     *
     * @param {Buffer} data
     */
    stderr: data => {
      errorOutput += stderrDecoder.write(data)
    },
  }

  let code = 0
  try {
    code = await exec(cmd, args, options)
  } catch {
    //the actual error does not matter, because it does not contain any relevant information. The actual exec output is collected bellow in output and errorOutput
    code = 1
  }

  output += stdoutDecoder.end()
  errorOutput += stderrDecoder.end()

  if (code === 0) {
    return output.trim()
  }

  throw new Error(
    `${cmd} ${removeConfidentialArguments(args).join(
        ' '
    )} returned code ${code} \nSTDOUT: ${output}\nSTDERR: ${errorOutput}`
  )
}

/**
 * By default, `@actions/exec` 1.x's exec method copies all env vars to the child process,
 * This includes `INPUT_*` vars that are specific to this action. This can leak repo secrets,
 * such as the user's NPM_TOKEN and OPTIC_TOKEN. It's recommended to filter these.
 * This may become the default behaviour in a future `@actions/exec` major release.
 * @see https://github.com/actions/toolkit/issues/309
 *
 * @returns {Record<string, any>}
 */
function getFilteredEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('INPUT_'))
  )
}

exports.execWithOutput = execWithOutput
exports.removeConfidentialArguments = removeConfidentialArguments
