import { describe, expect, it } from 'vitest'
import { presentConnectionStatus } from '../src/connectionStatus.ts'

describe('connection status labels', () => {
  it('stays Disconnected when a reset reports a lowercase or closed state', () => {
    expect(presentConnectionStatus('disconnected')).toBe('Disconnected')
    expect(presentConnectionStatus('closed')).toBe('Disconnected')
    expect(presentConnectionStatus('Disconnected')).toBe('Disconnected')
  })

  it('uses the same human labels for waiting and connected peers', () => {
    expect(presentConnectionStatus('connected')).toBe('Connected')
    expect(presentConnectionStatus('connecting')).toBe('Connecting…')
    expect(presentConnectionStatus('waiting-for-answer')).toBe('Waiting for your friend…')
    expect(presentConnectionStatus('waiting-for-peer')).toBe('Waiting for your friend…')
    expect(presentConnectionStatus('failed')).toBe('Could not connect')
  })
})
