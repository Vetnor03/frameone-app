# FamilyWall MCP developer probe

This is an owner-only OAuth and MCP read diagnostic, not a finished Connect App. It is off by default and has no Supabase writes, no token persistence and no mutation tool calls. It deliberately does not use unofficial FamilyWall APIs.

## Test setup (owner-only developer deployment)

- Confirm the official endpoint and OAuth issuer using FamilyWall's published metadata. Review whether its terms permit independent background synchronization before enabling a real integration.
- Set FAMILYWALL_MCP_PROBE_ENABLED=true and FAMILYWALL_MCP_TEST_USER_IDS to the exact RE:MIND developer account UUID.
- Set FAMILYWALL_MCP_APP_ORIGIN to the exact HTTPS origin of the private deployment (no path). The callback is /api/integrations/familywall/probe.
- The only default trusted network origin is https://mcp.familywall.com. If metadata identifies a different official OAuth origin, verify it independently before adding it to FAMILYWALL_MCP_TRUSTED_ORIGINS (comma separated exact HTTPS origins).
- If dynamic registration is not available, configure FAMILYWALL_MCP_CLIENT_ID with an approved public client registered for that exact redirect URI. FAMILYWALL_MCP_SCOPE is optional and must be based on verified provider documentation. Do not impersonate ChatGPT or use its client ID.
- Use the existing INTEGRATION_CREDENTIALS_KEY. Sign into RE:MIND with the allowlisted developer account, open Connect Apps and choose FamilyWall > Test connection. Sign in directly at FamilyWall and authorize a test family you have permission to access. The callback reads a seven-day calendar window, available lists and the first recognized list's incomplete items through the three explicit read tools. It returns to Connect Apps and displays only statuses and redacted response shapes in an encrypted, user-bound, 15-minute cookie. No family data or tokens are returned to the app or stored.
- A failure is expected if FamilyWall only permits supported assistants, requires a confidential client, or rejects our redirect URL. Do not work around provider restrictions.
- Turn off the probe and revoke the test authorization in FamilyWall afterward.

## Next implementation gate

Live OAuth and tool discovery succeeded in the first owner test. The next gate is a successful read diagnostic with synthetic family data and inspection of redacted output shapes. Implement an explicit allowlist of confirmed read-only tools, user-selected calendar/task/grocery sources, encrypted server-side credential storage and refresh, a bounded sync cadence, user-specific disconnect/revocation and existing delta-based frame updates. Do not treat readOnlyHint as a security boundary. Never connect grocery writes until separately designed and authorized. iCal remains a separate supported calendar fallback.
