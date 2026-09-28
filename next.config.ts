import type { NextConfig } from "next";

// Previews are not allowed to reuse production's Supabase project. Fail the
// build before generating a deployment if staging has not been configured.
if (process.env.VERCEL_ENV === "preview") {
  const stagingRef = process.env.REMIND_STAGING_SUPABASE_REF?.trim();
  const suppliedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const productionRef = "bzkqyllgccswrfudmexm";

  if (!stagingRef || !/^[a-z0-9]{20}$/.test(stagingRef) || stagingRef === productionRef) {
    throw new Error(
      "Preview deployment blocked: configure REMIND_STAGING_SUPABASE_REF for a separate Supabase project."
    );
  }

  if (suppliedUrl !== `https://${stagingRef}.supabase.co`) {
    throw new Error(
      "Preview deployment blocked: NEXT_PUBLIC_SUPABASE_URL does not match the staging Supabase project."
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Preview deployment blocked: staging Supabase credentials must be configured."
    );
  }
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
