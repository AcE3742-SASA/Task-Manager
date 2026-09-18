// Load the real server dependencies in a separate Node process; no account or network calls.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
assert.equal(config.env.NODE_OPTIONS, '--experimental-require-module')
const result = spawnSync(process.execPath, [config.env.NODE_OPTIONS, '--input-type=module', '-e', `
  import { getAuth } from 'firebase-admin/auth'
  import { getFirestore } from 'firebase-admin/firestore'
  import webpush from 'web-push'
  if (![getAuth, getFirestore, webpush.generateRequestDetails].every(fn => typeof fn === 'function')) {
    throw new Error('server-runtime-import-failed')
  }
`], { encoding: 'utf8', cwd: new URL('..', import.meta.url) })
if (result.error) throw result.error
assert.equal(result.status, 0, result.stderr)
console.log('PASS: real Firebase Auth, Firestore and Web Push modules load with the Vercel runtime option')
