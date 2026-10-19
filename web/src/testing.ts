import { vi } from 'vitest'

// Test helpers: build API bodies and a fetch stub whose responses the test
// releases by hand, in any order.

type PersonBody = { id: number; name: string; weeklyHours: number }

export function capacityBody(
  weekStarts: string[],
  people: PersonBody[],
  allocations: Record<number, Record<string, number>> = {},
) {
  return {
    from: weekStarts[0],
    to: weekStarts[weekStarts.length - 1],
    weeks: weekStarts.map((start, i) => ({ start, isoYear: 2026, isoWeek: i + 1 })),
    people,
    allocations,
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type Pending = { url: string; init: RequestInit | undefined; respond: (res: Response) => void; fail: (err: unknown) => void }

/** Stubs global fetch. Every call waits until the test calls respond/fail on it. */
export function stubFetch() {
  const calls: Pending[] = []
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      calls.push({ url, init, respond: resolve, fail: reject })
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    calls,
    last(): Pending {
      const call = calls[calls.length - 1]
      if (!call) throw new Error('fetch was not called')
      return call
    },
  }
}
