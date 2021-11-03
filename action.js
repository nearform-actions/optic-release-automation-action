module.exports = function ({ github, context }) {
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const branchName = 'refs/heads/release/${{ steps.npm-op.outputs.version }}';

  await github.rest.git.createRef({
    owner,
    repo,
    ref: branchName,
    sha: '${{ github.sha }}',
  });

  await github.rest.pulls.create({
    owner,
    repo,
    head: branchName,
    base: 'refs/heads/main',
  });

  await github.rest.repos.createRelease({
    owner,
    repo,
    tag_name: '${{ steps.npm-op.outputs.version }}',
    generate_release_notes: true
  });
}
