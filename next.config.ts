import type { NextConfig } from "next";

// Staging must never reuse production's Vercel project, Supabase project,
// database connection or external-action secrets. This runs at build time.
const liveProductionProjectId = "prj_boLzA3f5Ntu4r4Ei0AeqYCPhNgv0";
const isLiveProduction =
  process.env.VERCEL_ENV === "production" &&
  process.env.VERCEL_PROJECT_ID === liveProductionProjectId &&
  process.env.VERCEL_GIT_COMMIT_REF === "main";

// A separate Vercel staging project's primary deployment also has
// VERCEL_ENV=production. Classify by project ID and Git branch, not by
// the deployment label alone. The live project remains on main.
const isStagingDeployment =
  process.env.VERCEL_ENV === "preview" ||
  (process.env.VERCEL_ENV === "production" && !isLiveProduction);

if (isStagingDeployment) {
  const actualProjectId = process.env.VERCEL_PROJECT_ID;
  const approvedStagingProjectId = process.env.REMIND_STAGING_VERCEL_PROJECT_ID?.trim();
  if (
    !actualProjectId ||
    actualProjectId === liveProductionProjectId ||
    !approvedStagingProjectId ||
    actualProjectId !== approvedStagingProjectId
  ) {
    throw new Error(
      "Staging deployment blocked: use a separate, explicitly approved Vercel staging project."
    );
  }
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_GIT_COMMIT_REF !== "development") {
    throw new Error("Staging deployment blocked: production branch must be development.");
  }

  const stagingRef = process.env.REMIND_STAGING_SUPABASE_REF?.trim();
  const suppliedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const expectedStagingRef = "ouwhfzjaahdipwmelzvf";

  // Pin the exact test project, not merely "any project other than production".
  if (stagingRef !== expectedStagingRef) {
    throw new Error(
      "Staging deployment blocked: REMIND_STAGING_SUPABASE_REF must identify the designated staging project."
    );
  }

  if (suppliedUrl !== `https://${stagingRef}.supabase.co`) {
    throw new Error(
      "Staging deployment blocked: NEXT_PUBLIC_SUPABASE_URL does not match the staging Supabase project."
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Staging deployment blocked: staging Supabase credentials must be configured."
    );
  }

  // A server-side fallback or direct database URL must never point at production.
  const optionalSupabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (optionalSupabaseUrl && optionalSupabaseUrl !== suppliedUrl) {
    throw new Error("Staging deployment blocked: SUPABASE_URL does not match staging.");
  }
  if (["DATABASE_URL", "DIRECT_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"].some(
    (name) => Boolean(process.env[name]?.trim()),
  )) {
    throw new Error("Staging deployment blocked: do not inherit direct database credentials.");
  }

  // Initial staging is deliberately core-app only. Vercel often copies env
  // variables to Preview; inherited live vendor credentials could send real
  // emails, run jobs or incur charges. Block those builds until integrations
  // are re-enabled individually with dedicated staging credentials and tests.
  const disabledIntegrations = [
    "RESEND_API_KEY",
    "CRON_SECRET",
    "MINRENOVASJON_APP_KEY",
    "MICROSOFT_CLIENT_SECRET",
    "INTEGRATION_CREDENTIALS_KEY",
    "SPOND_CREDENTIALS_KEY",
    "OPENAI_API_KEY",
    "VAPID_PRIVATE_KEY",
    "WEB_PUSH_PRIVATE_KEY",
    "SHOPIFY_ADMIN_ACCESS_TOKEN",
    "SHOPIFY_STOREFRONT_ACCESS_TOKEN",
  ];
  const configuredIntegrations = disabledIntegrations.filter(
    (name) => Boolean(process.env[name]?.trim()),
  );
  if (configuredIntegrations.length > 0) {
    throw new Error(
      `Staging deployment blocked: remove production-capable integrations from Preview: ${configuredIntegrations.join(", ")}.`,
    );
  }
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
