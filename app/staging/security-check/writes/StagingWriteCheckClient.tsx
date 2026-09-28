'use client'

import { useState } from 'react'
import { supabase } from '@/app/lib/supabase'

type Result = { label: string; ok: boolean; status: number; expected: number }
type Fixture = { label: string; own: string; other: string; ownMarker: string }
type RecordValue = Record<string, unknown>

const FIXTURES: Record<string, Fixture> = {
  'tester-a@re-mind.test': {
    label: 'Tester A',
    own: 'frm_FAEE00000001',
    other: 'frm_FBEE00000002',
    ownMarker: 'A',
  },
  'tester-b@re-mind.test': {
    label: 'Tester B',
    own: 'frm_FBEE00000002',
    other: 'frm_FAEE00000001',
    ownMarker: 'B',
  },
}

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}

type TestCase = {
  label: string
  endpoint: string
  body: RecordValue
  expected: number
  error: string
  bearer: boolean
}

async function postCheck(testCase: TestCase, token: string) {
  // These requests only target the separate, throwaway frames above.
  // Never log, display, place in URLs, or persist access tokens.
  const response = await fetch(testCase.endpoint, {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(testCase.bearer ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(testCase.body),
  })
  const payload = record(await response.json().catch(() => null))
  return { status: response.status, error: payload.error }
}

export default function StagingWriteCheckClient() {
  const [running, setRunning] = useState(false)
  const [account, setAccount] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [message, setMessage] = useState('')

  async function runNegativeWrites() {
    if (running) return
    setRunning(true)
    setResults([])
    setMessage('')
    setAccount('')
    try {
      const { data: verified, error: verifyError } = await supabase.auth.getUser()
      const user = verified.user
      const fixture = user?.email ? FIXTURES[user.email.trim().toLowerCase()] : undefined
      if (verifyError || !user || !fixture) {
        setMessage('Sign in as Tester A or Tester B before running the checks.')
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session || session.user.id !== user.id || !session.access_token) {
        setMessage('No matching active session. Sign in again and retry.')
        return
      }

      // Fail closed if fixtures were removed, reassigned or shared. All tests
      // target the OTHER throwaway frame, never either original virtual frame.
      const [ownMember, otherMember, ownSettings] = await Promise.all([
        supabase.from('device_members').select('role').eq('device_id', fixture.own).eq('user_id', user.id).maybeSingle(),
        supabase.from('device_members').select('role').eq('device_id', fixture.other).eq('user_id', user.id).maybeSingle(),
        supabase.from('device_settings').select('settings_json').eq('device_id', fixture.own).maybeSingle(),
      ])
      const settings = record(ownSettings.data?.settings_json)
      if (ownMember.error || otherMember.error || ownSettings.error ||
          ownMember.data?.role !== 'owner' || otherMember.data ||
          settings.staging_disposable_security_fixture !== fixture.ownMarker) {
        setMessage('Disposable test fixtures were not verified. No write requests were sent.')
        return
      }

      setAccount(fixture.label)
      const other = fixture.other
      const requestId = 'staging-negative-write-probe-' + crypto.randomUUID()
      const tests: TestCase[] = [
        {
          label: 'Missing token cannot save settings',
          endpoint: '/api/device/save-settings',
          body: { device_id: other, settings_json: { unauthorized_probe: true } },
          bearer: false, expected: 401, error: 'missing_auth_token',
        },
        {
          label: 'Missing token cannot delete frame',
          endpoint: '/api/frame/delete',
          body: { device_id: other },
          bearer: false, expected: 401, error: 'missing_auth_token',
        },
        {
          label: 'Cannot overwrite other tester’s settings',
          endpoint: '/api/device/save-settings',
          body: { device_id: other, settings_json: { unauthorized_probe: true } },
          bearer: true, expected: 403, error: 'forbidden',
        },
        {
          label: 'Cannot rename other tester’s frame',
          endpoint: '/api/frame/rename',
          body: { device_id: other, display_name: 'UNAUTHORIZED WRITE TEST' },
          bearer: true, expected: 403, error: 'frame_owner_required',
        },
        {
          label: 'Cannot request other tester’s frame refresh',
          endpoint: '/api/device/update-state/request',
          body: { device_id: other, request_id: requestId },
          bearer: true, expected: 403, error: 'forbidden',
        },
        {
          label: 'Cannot set other tester’s app-activity heartbeat',
          endpoint: '/api/device/update-state/activity',
          body: { device_id: other },
          bearer: true, expected: 403, error: 'forbidden',
        },
        {
          label: 'Cannot reset/delete other tester’s disposable frame',
          endpoint: '/api/frame/delete',
          body: { device_id: other },
          bearer: true, expected: 404, error: 'frame_not_found',
        },
      ]

      for (const testCase of tests) {
        let result: { status: number; error: unknown }
        try {
          result = await postCheck(testCase, session.access_token)
        } catch {
          setMessage('A request failed. Checks stopped. Send a screenshot; do not rerun yet.')
          return
        }
        const ok = result.status === testCase.expected && result.error === testCase.error
        setResults((prior) => [...prior, {
          label: testCase.label, ok, status: result.status, expected: testCase.expected,
        }])
        if (!ok) {
          setMessage('Unexpected response: checks stopped immediately. Send a screenshot; do not rerun yet.')
          return
        }
      }
      setMessage('All seven negative-write checks passed for ' + fixture.label +
        '. Switch testers and repeat. The disposable records will be verified directly in staging afterward.')
    } catch {
      setMessage('Checks stopped due to an error. Send a screenshot; do not rerun yet.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <main className="remind-app min-h-screen bg-[color:var(--app-bg)] px-5 py-12 text-[color:var(--fg)]">
      <div className="mx-auto w-full max-w-xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#2aa3ff]">RE:MIND · STAGING ONLY</p>
        <h1 className="mt-3 text-2xl font-semibold">Cross-user write checks</h1>
        <p className="mt-4 text-sm leading-6 text-[color:var(--fg-60)]">
          Seven deliberate POST requests will try to change the OTHER tester’s disposable
          security-test frame. They never target either original virtual frame or a physical
          device. If authorization unexpectedly succeeds, the run stops immediately.
        </p>
        <div className="mt-6 rounded-xl border border-[color:var(--bd-20)] p-4">
          <p className="text-sm font-medium">Signed-in account: {account || 'Not checked yet'}</p>
          <button
            type="button"
            disabled={running}
            onClick={() => void runNegativeWrites()}
            className="mt-4 min-h-12 w-full rounded-xl border border-[#2aa3ff] px-4 font-medium text-[#2aa3ff] disabled:opacity-50"
          >
            {running ? 'RUNNING…' : 'RUN NEGATIVE WRITE CHECKS'}
          </button>
          {message ? <p role="status" className="mt-4 text-sm leading-6">{message}</p> : null}
        </div>
        {results.length > 0 ? (
          <div className="mt-6 space-y-3">
            {results.map((result) => (
              <div key={result.label} className="rounded-xl border border-[color:var(--bd-20)] p-4">
                <p className="text-sm font-medium">{result.ok ? 'PASS' : 'CHECK'} · {result.label}</p>
                <p className="mt-1 text-xs text-[color:var(--fg-55)]">
                  HTTP {result.status} · expected {result.expected}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        <p className="mt-8 text-xs leading-5 text-[color:var(--fg-45)]">
          Only test accounts and disposable staging fixtures may be used. This is not
          a physical firmware or legacy pairing test. No passwords or tokens appear in results.
        </p>
        <a href="/login?tester=1" className="mt-5 inline-block text-sm text-[#2aa3ff] underline">
          Switch to the other tester
        </a>
        <span className="mx-3 text-[color:var(--fg-45)]">·</span>
        <a href="/staging/security-check" className="text-sm text-[#2aa3ff] underline">
          Read-only checks
        </a>
      </div>
    </main>
  )
}
