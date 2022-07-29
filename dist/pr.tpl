## Optic Release Automation

This **draft** PR is opened by Github action [optic-release-automation-action](https://github.com/nearform/optic-release-automation-action).

A new **draft** GitHub release [${releaseMeta.version}](${draftRelease.html_url}) has been created.

Release author: @${author}

#### If you want to go ahead with the release, please merge this PR. When you merge:

- The GitHub release will be published
<% if (npmPublish) { %>
- The npm package with tag ${releaseMeta.npmTag} will be published according to the publishing rules you have configured
<% } else { %>
- No npm package will be published as configured
<% } %>

<% if (syncTags) { %>
- The following tags will be updated to point to the latest appropriate commit: ${tagsToUpdate}
<% } else { %>
- No major or minor tags will be updated as configured
<% } %>

#### Artifacts
<% if (artifactAttached) { %>
- An artifact will be attached to the release
<% } else { %>
- No artifacts will be attached to the release
<% } %>

#### If you close the PR

- The new draft release will be deleted and nothing will change

${draftRelease.body}

<!--
<release-meta>${JSON.stringify(releaseMeta)}</release-meta>
-->
