/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Company onboarding (docs/company-onboarding-v1-implementation.md): the
  // Documents-upload server action accepts a whole PDF/DOCX/TXT file via
  // FormData - Next's default 1MB server-action body limit is too small for
  // a real credit agreement/indenture PDF.
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
