declare module '*.elm' {
  export interface ElmAppInstance {
    ports: {
      themeChanged: {
        subscribe: (callback: (theme: string) => void) => void
      }
      copyText: { subscribe: (callback: (payload: string) => void) => void }
      initializeIdentity: { send: (payload: { name: string }) => void }
      createOffer: { send: (payload: null) => void }
      acceptOffer: { send: (payload: string) => void }
      setRemoteAnswer: { send: (payload: string) => void }
      prepareEnvelope: {
        send: (payload: {
          recipient: string
          subject: string
          body: string
          releaseHours: number
          releaseSeconds: number
        }) => void
      }
      decryptEnvelope: { send: (payload: string) => void }
      identityLoaded: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      offerCreated: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      answerCreated: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      connectionStatus: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      envelopeSent: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      envelopeReceived: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      letterDecrypted: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      bridgeError: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      debugLog: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      saveDraft: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      saveContact: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      stateLoaded: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      exportIdentity: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      identityExported: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      importIdentity: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      downloadIdentity: { send: (payload: unknown) => void; subscribe: (callback: (payload: string) => void) => void }
      importIdentityFile: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      identityFileLoaded: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      resetConnection: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      archiveOutbox: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      archiveSent: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      restoreOutbox: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      deleteArchivedOutbox: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      restoreSent: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      deleteArchivedSent: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      retryEnvelope: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
      outboxUpdated: { send: (payload: unknown) => void; subscribe: (callback: (payload: unknown) => void) => void }
    }
  }

  export interface ElmApp<TFlags> {
    Main: {
      init: (options: { node: HTMLElement; flags: TFlags }) => ElmAppInstance
    }
  }

  export const Elm: ElmApp<Record<string, unknown>>
}
