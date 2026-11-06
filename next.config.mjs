/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: { serverComponentsExternalPackages: ['pg', 'nodemailer'] },
  // Đường dẫn theo spec 04_FRONTEND_PAGES.md: /admin = trang quản trị CEO, /admin/approval = Quick Approve Center.
  async redirects() {
    return [
      { source: '/admin', destination: '/quan-tri', permanent: false },
      { source: '/admin/approval', destination: '/quan-tri/duyet-nhanh', permanent: false },
      { source: '/admin/approval/:id', destination: '/quan-tri/duyet-nhanh', permanent: false },
      { source: '/admin/payment', destination: '/quan-tri/kiem-soat-chi', permanent: false },
    ];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};
export default nextConfig;
