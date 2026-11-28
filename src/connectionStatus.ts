/** Human labels for WebRTC and signaling states. Display only. */
export function presentConnectionStatus(status: string): string {
  switch (status) {
    case 'disconnected':
    case 'closed':
    case 'new':
    case 'Disconnected':
      return 'Disconnected'
    case 'connected':
    case 'Connected':
      return 'Connected'
    case 'connecting':
    case 'Connecting…':
      return 'Connecting…'
    case 'failed':
    case 'Could not connect':
      return 'Could not connect'
    case 'waiting-for-answer':
    case 'waiting-for-peer':
    case 'Waiting for your friend…':
      return 'Waiting for your friend…'
    default:
      return status
  }
}
