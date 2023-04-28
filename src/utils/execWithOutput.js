'use strict'

const { StringDecoder } = require('node:string_decoder')

const { exec } = require('@actions/exec')

/**
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {{cwd?: string}} options
 * @returns Promise<string>
 */
async function execWithOutput(cmd, args, { cwd, ...options } = {}) {
  let output = ''
  let errorOutput = ''

  const stdoutDecoder = new StringDecoder('utf8')
  const stderrDecoder = new StringDecoder('utf8')

  options.silent = false

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
    `${cmd} ${args.join(
      ' '
    )} returned code ${code} \nSTDOUT: ${output}\nSTDERR: ${errorOutput}`
  )
}

exports.execWithOutput = execWithOutput
