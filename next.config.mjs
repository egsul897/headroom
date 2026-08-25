/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Company onboarding (docs/company-onboarding-v1-implementation.md): the
  // Documents-upload server action accepts a whole PDF/DOCX/TXT file via
  // FormData - Next's default 1MB server-action body limit is too small for
  // a real credit agreement/indenture PDF. 50mb covers a real filed
  // agreement with exhibits/schedules (typically 1-30MB as scanned PDFs);
  // bumped from the original 20mb during the live-upload bugfix
  // (docs/live-document-upload-bugfix.md) once a real test document's size
  // made the earlier margin too tight.
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
