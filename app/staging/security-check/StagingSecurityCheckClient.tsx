'use client'

import { useState } from 'react'
import { supabase } from '@/app/lib/supabase'

type Result = { label: string; ok: boolean; detail: string }
type Fixture = { label: string; own: string; other: string }
type JsonRecord = Record<string, unknown>

const FIXTURES: Record<string, Fixture> = {
  'tester-a@re-mind.test': {
    label: 'Tester A',
    own: 'frm_FA0000000001',
    other: 'frm_FB0000000002',
  },
  'tester-b@re-mind.test': {
    label: 'Tester B',
    own: 'frm_FB0000000002',
    other: 'frm_FA0000000001',
  },
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

async function probe(path: string, token?: string): Promise<{ status: number; body: JsonRecord }> {
  // All probes use GET and the existing same-origin app session. Never put a
  // bearer in a query parameter, display a token or submit/write test data.
  const response = await fetch(path, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  })
  const body = record(await response.json().catch(() => null))
  return { status: response.status, body }
}

export default function StagingSecurityCheckClient() {
  const [running, setRunning] = useState(false)
  const [account, setAccount] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [message, setMessage] = useState('')

  async function runChecks() {
    if (running) return
    setRunning(true)
    setResults([])
    setMessage('')
    setAccount('')

    try {
      const { data: verified, error: userError } = await supabase.auth.getUser()
      const email = verified.user?.email?.trim().toLowerCase() || ''
      const fixture = FIXTURES[email]
      if (userError || !verified.user || !fixture) {
        setMessage('Sign in as Tester A or Tester B first, then try again.')
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session || session.user.id !== verified.user.id || !session.access_token) {
        setMessage('No matching active Supabase session. Please sign in again.')
        return
      }

      setAccount(fixture.label)
      const token = session.access_token
      const checks: Result[] = []
      const add = (label: string, ok: boolean, detail: string) => {
        checks.push({ label, ok, detail })
        setResults([...checks])
      }
      const examine = async (
        label: string,
        path: string,
        expectedStatus: number,
        bearer: boolean | 'invalid' = true,
        predicate: (body: JsonRecord) => boolean = () => true,
      ) => {
        try {
          const response = await probe(path, bearer === 'invalid' ? 'staging-invalid-bearer' : bearer ? token : undefined)
          const ok = response.status === expectedStatus && predicate(response.body)
          add(label, ok, 'HTTP ' + response.status + (ok ? ' — expected result' : ' — unexpected result'))
        } catch {
          add(label, false, 'Request failed or timed out')
        }
      }

      // The normal signed-in endpoint should return only this test user's frame.
      await examine(
        'My frame list contains my frame, not the other tester’s',
        '/api/device/user-frames',
        200,
        false,
        (body) => {
          if (body.ok !== true || !Array.isArray(body.frames)) return false
          const ids = body.frames.map((row) => String(record(row).device_id || ''))
          return ids.includes(fixture.own) && !ids.includes(fixture.other)
        },
      )

      await examine(
        'My display-revision status is accessible',
        '/api/device/update-state/status?device_id=' + encodeURIComponent(fixture.own),
        200,
        true,
        (body) => typeof body.requested_revision === 'number',
      )

      await examine(
        'Other tester’s display-revision status is forbidden',
        '/api/device/update-state/status?device_id=' + encodeURIComponent(fixture.other),
        403,
      )

      await examine(
        'Other tester’s mirror/configuration is forbidden',
        '/api/device/mirror-snapshot?device_id=' + encodeURIComponent(fixture.other),
        403,
        true,
        (body) => !Object.hasOwn(body, 'settings_json') && !Object.hasOwn(body, 'detailsBySlot'),
      )

      await examine(
        'App user session cannot impersonate other physical frame',
        '/api/device/frame-config?device_id=' + encodeURIComponent(fixture.other),
        401,
        true,
        (body) => !Object.hasOwn(body, 'settings_json'),
      )

      await examine(
        'App user session cannot query hardware revision as a physical frame',
        '/api/device/update-state?device_id=' + encodeURIComponent(fixture.other),
        401,
      )

      await examine(
        'My device telemetry is accessible as a member',
        '/api/device/status?device_id=' + encodeURIComponent(fixture.own),
        200,
        true,
        (body) => body.device_id === fixture.own,
      )

      await examine(
        'Other tester’s device telemetry is forbidden',
        '/api/device/status?device_id=' + encodeURIComponent(fixture.other),
        403,
      )

      await examine(
        'Invalid bearer cannot fall back to browser cookie for device telemetry',
        '/api/device/status?device_id=' + encodeURIComponent(fixture.own),
        401,
        'invalid',
      )

      await examine(
        'Missing bearer is rejected on user display-revision status',
        '/api/device/update-state/status?device_id=' + encodeURIComponent(fixture.own),
        401,
        false,
      )

      setMessage(
        checks.every((check) => check.ok)
          ? 'All read-only checks passed for ' + fixture.label + '. Run them again as the other tester.'
          : 'At least one check needs investigation. Please share a screenshot of the results.',
      )
    } catch {
      setMessage('Could not complete the checks. Please try again or send a screenshot.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <main className="remind-app min-h-screen bg-[color:var(--app-bg)] px-5 py-12 text-[color:var(--fg)]">
      <div className="mx-auto w-full max-w-xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#2aa3ff]">RE:MIND · STAGING ONLY</p>
        <h1 className="mt-3 text-2xl font-semibold">API security checks</h1>
        <p className="mt-4 text-sm leading-6 text-[color:var(--fg-60)]">
          Use your existing Tester A or B session. This performs ten read-only requests to
          the staging app. It does not modify settings, reminders, devices or pairing credentials.
        </p>
        <div className="mt-6 rounded-xl border border-[color:var(--bd-20)] p-4">
          <p className="text-sm font-medium">Signed-in account: {account || 'Not checked yet'}</p>
          <button
            type="button"
            disabled={running}
            onClick={() => void runChecks()}
            className="mt-4 min-h-12 w-full rounded-xl border border-[#2aa3ff] px-4 font-medium text-[#2aa3ff] disabled:opacity-50"
          >
            {running ? 'RUNNING CHECKS…' : 'RUN READ-ONLY CHECKS'}
          </button>
          {message ? <p role="status" className="mt-4 text-sm leading-6">{message}</p> : null}
        </div>
        {results.length > 0 ? (
          <div className="mt-6 space-y-3">
            {results.map((result) => (
              <div key={result.label} className="rounded-xl border border-[color:var(--bd-20)] p-4">
                <p className="text-sm font-medium">{result.ok ? 'PASS' : 'CHECK'} · {result.label}</p>
                <p className="mt-1 text-xs text-[color:var(--fg-55)]">{result.detail}</p>
              </div>
            ))}
          </div>
        ) : null}
        <p className="mt-8 text-xs leading-5 text-[color:var(--fg-45)]">
          These tests do not clear the legacy pairing risks or prove that a legitimate physical frame can report status.
          They intentionally never call the token-minting legacy pairing-status route.
          An HTTP pass is not a full security certification.
        </p>
        <a href="/login?tester=1" className="mt-6 inline-block text-sm text-[#2aa3ff] underline">
          Switch to the other tester
        </a>
      </div>
    </main>
  )
}
