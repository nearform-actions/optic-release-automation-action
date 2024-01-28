'use strict'

module.exports = {
  PR_TITLE_PREFIX: '[OPTIC-RELEASE-AUTOMATION]',
  ZIP_EXTENSION: '.zip',
  APP_NAME: 'optic-release-automation[bot]',
  AUTO_INPUT: 'auto',
  ACCESS_OPTIONS: ['public', 'restricted'],
  REDACTION_META_INFO_FOR_CONFIDENTIAL_ARGS: {
    '--OTP': {
        redactCurrentArg: true,
        redactNextArg: true,
    }
  },
}
