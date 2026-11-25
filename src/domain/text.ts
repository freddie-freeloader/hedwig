export const NAME_MAX = 32
export const SUBJECT_MAX = 80
export const BODY_MAX = 8000

function forbiddenControl(value: string, allowNewlines: boolean): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (allowNewlines && (code === 9 || code === 10 || code === 13)) continue
    if (code < 32 || code === 127) return true
  }
  return false
}

export function cleanDisplayName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, ' ')
  if (name.length < 1 || name.length > NAME_MAX) return null
  if (forbiddenControl(name, false)) return null
  return name
}

export function cleanSubject(input: string): string | null {
  const subject = input.trim().replace(/\s+/g, ' ')
  if (subject.length < 1 || subject.length > SUBJECT_MAX) return null
  if (forbiddenControl(subject, false)) return null
  return subject
}

export function cleanBody(input: string): string | null {
  const body = input.replace(/\r\n/g, '\n').trim()
  if (body.length < 1 || body.length > BODY_MAX) return null
  if (forbiddenControl(body, true)) return null
  return body
}
