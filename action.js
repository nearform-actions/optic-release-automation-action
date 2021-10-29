module.exports = ({ github, context }) => {
  console.log('=1=1=1=1')
  return context.payload.client_payload.value
}
