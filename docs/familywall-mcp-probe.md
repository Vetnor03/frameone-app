# FamilyWall MCP developer probe

This draft is an OAuth and MCP discovery spike, not a finished Connect App. It is off by default and has no Supabase writes, no customer data reads, no token persistence, no tool calls, and no UI changes. It deliberately does not use unofficial FamilyWall APIs.

## Test setup (private developer deployment)

- Confirm the official endpoint and OAuth issuer using FamilyWall's published metadata. Review whether its terms permit independent background synchronization before enabling a real integration.
- Set FAMILYWALL_MCP_PROBE_ENABLED=true and FAMILYWALL_MCP_TEST_USER_IDS to the exact RE:MIND developer account UUID.
- Set FAMILYWALL_MCP_APP_ORIGIN to the exact HTTPS origin of the private deployment (no path). The callback is /api/integrations/familywall/probe.
- The only default trusted network origin is https://mcp.familywall.com. If metadata identifies a different official OAuth origin, verify it independently before adding it to FAMILYWALL_MCP_TRUSTED_ORIGINS (comma separated exact HTTPS origins).
- If dynamic registration is not available, configure FAMILYWALL_MCP_CLIENT_ID with an approved public client registered for that exact redirect URI. FAMILYWALL_MCP_SCOPE is optional and must be based on verified provider documentation. Do not impersonate ChatGPT or use its client ID.
- Use the existing INTEGRATION_CREDENTIALS_KEY. POST to the route with the signed-in RE:MIND user's Bearer session token from the same browser; open the returned URL in that browser. Sign in directly at FamilyWall and authorize a test family. The callback returns a list of MCP tool names and input schemas, not family content or tokens.
- A failure is expected if FamilyWall only permits supported assistants, requires a confidential client, or rejects our redirect URL. Do not work around provider restrictions.
- Turn off the probe and revoke the test authorization in FamilyWall afterward.

## Next implementation gate

After successful discovery, inspect the real read tool schemas and test with synthetic family data. Implement an explicit allowlist of confirmed read-only tools, user-selected calendar/task/grocery sources, encrypted server-side credential storage and refresh, a bounded sync cadence, user-specific disconnect/revocation and existing delta-based frame updates. Do not treat readOnlyHint as a security boundary. Never connect grocery writes until separately designed and authorized. iCal remains a separate supported calendar fallback.
