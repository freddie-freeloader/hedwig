export function explain(error: string): string {
  switch (error) {
    case 'already-opened-today':
      return "You already opened today's post. Letters that arrive now stay sealed until tomorrow."
    case 'date-went-backwards':
      return 'This desk has already opened a later day. Check the date on the device.'
    case 'date-not-plausible':
      return "This device's date is too far from the relay. Check the clock, then try again."
    case 'timezone-mismatch':
      return 'This owl’s post is dated in the timezone chosen when it was created.'
    case 'invalid-timezone':
      return 'That timezone is not one the desk can use.'
    case 'invalid-date':
      return 'That is not a real calendar day.'
    case 'stale-request':
      return 'The request expired. Check the clock, then try again.'
    case 'bad-signature':
      return 'The relay rejected the signature on that request.'
    case 'unknown-owl':
      return 'No owl is using that address.'
    case 'already-registered':
      return 'This owl is already registered with a different perch.'
    case 'stale-inbox':
      return 'Their perch rotated. The letter will be sealed for the new key.'
    case 'mailbox-full':
      return 'Their perch is holding as many sealed letters as it can.'
    case 'bad-inbox-key':
      return 'The inbox key was rejected.'
    case 'pending-ack':
      return 'The previous opening is still finishing.'
    case 'too-large':
      return 'That letter is too large for the relay.'
    case 'bad-request':
      return 'The relay could not read that request.'
    case 'not-found':
      return 'The relay has no such route.'
    default:
      return 'The relay refused that request.'
  }
}
