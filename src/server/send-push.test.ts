import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ request: vi.fn(), generateRequestDetails: vi.fn() }))
vi.mock('node:https', () => ({ request: mock.request }))
vi.mock('web-push', () => ({ default: { generateRequestDetails: mock.generateRequestDetails } }))
import { sendPush } from './send-push'

class Response extends EventEmitter {
  statusCode: number | undefined = 201
  headers: Record<string, string> = {}
}
class Request extends EventEmitter {
  end = vi.fn()
  destroy = vi.fn((error: Error) => { this.emit('error', error); return this })
  setTimeout = vi.fn()
}
type RequestOptions = { signal: AbortSignal; method?: string; headers?: unknown; rejectUnauthorized?: boolean }
let req: Request
let response: Response
let options: RequestOptions
let respond: () => void
const subscription = { endpoint: 'https://web.push.apple.com/synthetic', keys: { p256dh: 'synthetic-public', auth: 'synthetic-auth' } }
const details = { endpoint: subscription.endpoint, method: 'POST', headers: { TTL: '90' }, body: Buffer.from('encrypted') }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  req = new Request()
  response = new Response()
  mock.generateRequestDetails.mockReturnValue(details)
  mock.request.mockImplementation((_endpoint: string, opts: RequestOptions, callback: (res: Response) => void) => {
    options = opts
    respond = () => callback(response)
    // Node HTTPS cancels the real request when this signal aborts. Model that contract here.
    opts.signal.addEventListener('abort', () => req.destroy(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' })), { once: true })
    return req
  })
})
afterEach(() => { vi.useRealTimers() })

describe('bounded Web Push transport', () => {
  it('uses the existing encryption/VAPID request and waits for response end, not only headers', async () => {
    const settled = vi.fn()
    const promise = sendPush(subscription, 'payload', { TTL: 90 })
    void promise.then(settled)
    expect(mock.generateRequestDetails).toHaveBeenCalledWith(subscription, 'payload', { TTL: 90 })
    expect(mock.request).toHaveBeenCalledWith(details.endpoint, expect.objectContaining({ method: 'POST', headers: details.headers }), expect.any(Function))
    expect(req.end).toHaveBeenCalledWith(details.body)
    respond()
    response.emit('data', Buffer.from('accepted'))
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    response.emit('end')
    await expect(promise).resolves.toEqual({ statusCode: 201, headers: {}, body: '' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts after five seconds even before DNS/connection returns any response', async () => {
    const promise = sendPush(subscription, 'payload')
    const rejection = expect(promise).rejects.toMatchObject({ code: 'ABORT_ERR' })
    await vi.advanceTimersByTimeAsync(4_999)
    expect(options.signal.aborted).toBe(false)
    expect(req.destroy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await rejection
    expect(options.signal.aborted).toBe(true)
    expect(req.destroy).toHaveBeenCalledTimes(1)
    expect(req.setTimeout).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps an absolute deadline while response data continues arriving', async () => {
    const promise = sendPush(subscription, 'payload')
    const rejection = expect(promise).rejects.toMatchObject({ code: 'ABORT_ERR' })
    respond()
    for (let elapsed = 0; elapsed < 4; elapsed++) {
      await vi.advanceTimersByTimeAsync(1_000)
      response.emit('data', Buffer.from('progress'))
      expect(options.signal.aborted).toBe(false)
    }
    await vi.advanceTimersByTimeAsync(1_000)
    await rejection
    expect(options.signal.aborted).toBe(true)
    expect(req.setTimeout).not.toHaveBeenCalled()
  })

  it('honors a caller timeout as a total deadline', async () => {
    const promise = sendPush(subscription, 'payload', { timeout: 1_200 })
    const rejection = expect(promise).rejects.toMatchObject({ code: 'ABORT_ERR' })
    await vi.advanceTimersByTimeAsync(1_199)
    expect(options.signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await rejection
  })

  it.each([400, 404, 410, 429, 503])('propagates HTTP status %i for retry/prune decisions', async status => {
    response.statusCode = status
    const promise = sendPush(subscription, 'payload')
    respond()
    response.emit('end')
    await expect(promise).rejects.toMatchObject({ message: 'push-rejected', statusCode: status })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps TLS certificate verification enabled and does not follow redirects', async () => {
    response.statusCode = 302
    response.headers = { location: 'https://attacker.invalid/collect' }
    const promise = sendPush(subscription, 'payload')
    expect(options.rejectUnauthorized).not.toBe(false)
    respond()
    response.emit('end')
    await expect(promise).rejects.toMatchObject({ statusCode: 302 })
    expect(mock.request).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('allows exactly 64 KiB of response data but aborts any larger response', async () => {
    const promise = sendPush(subscription, 'payload')
    respond()
    response.emit('data', Buffer.alloc(65_536))
    expect(req.destroy).not.toHaveBeenCalled()
    response.emit('data', Buffer.alloc(1))
    await expect(promise).rejects.toThrow('push-response-too-large')
    expect(req.destroy).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up the deadline on request errors and never aborts a completed failure later', async () => {
    const error = Object.assign(new Error('TLS validation failed'), { code: 'CERT_HAS_EXPIRED' })
    const promise = sendPush(subscription, 'payload')
    req.emit('error', error)
    await expect(promise).rejects.toBe(error)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(options.signal.aborted).toBe(false)
  })

  it('cleans up the deadline when the response stream errors before end', async () => {
    const error = new Error('response-reset')
    const promise = sendPush(subscription, 'payload')
    respond()
    response.emit('error', error)
    await expect(promise).rejects.toBe(error)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up on a synchronous HTTPS failure and sends nothing when encryption fails', async () => {
    mock.request.mockImplementationOnce(() => { throw new Error('bad-request') })
    await expect(sendPush(subscription, 'payload')).rejects.toThrow('bad-request')
    expect(vi.getTimerCount()).toBe(0)
    mock.request.mockClear()
    mock.generateRequestDetails.mockImplementationOnce(() => { throw new Error('bad-encryption-key') })
    await expect(sendPush(subscription, 'payload')).rejects.toThrow('bad-encryption-key')
    expect(mock.request).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
