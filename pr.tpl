## Optic Release Automation

This **draft** PR is opened by Github action [optic-release-automation-action](https://github.com/nearform/optic-release-automation-action).

A new **draft** GitHub release [${releaseMeta.version}](${draftRelease.html_url}) has been created.

#### If you want to go ahead with the release, please merge this PR. When you merge:

- The GitHub release will be published
<% if (npmPublish) { %>
- The npm package with tag ${releaseMeta.npmTag} will be published according to the publishing rules you have configured
<% } else { %>
- No npm package will be published as configured
<% } %>

#### If you close the PR

- The new draft release will be deleted and nothing will change

${draftRelease.body}

<!--
<release-meta>${JSON.stringify(releaseMeta)}</release-meta>
-->
