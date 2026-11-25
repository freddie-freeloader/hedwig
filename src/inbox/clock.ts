export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now() {
    return new Date()
  },
}

export class ManualClock implements Clock {
  private current: Date

  constructor(start: Date) {
    this.current = new Date(start.getTime())
  }

  now(): Date {
    return new Date(this.current.getTime())
  }

  set(next: Date): void {
    this.current = new Date(next.getTime())
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds)
  }
}
