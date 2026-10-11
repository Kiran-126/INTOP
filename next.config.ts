import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/api/auth/register', destination: '/api/platform?resource=register' },
      { source: '/api/auth/login', destination: '/api/platform?resource=login' },
      { source: '/api/auth/logout', destination: '/api/platform?resource=logout' },
      { source: '/api/auth/google', destination: '/api/platform?resource=google' },
      { source: '/api/auth/google/callback', destination: '/api/platform?resource=google-callback' },
      { source: '/api/auth/me', destination: '/api/platform?resource=me' },
      { source: '/api/opportunities/:id', destination: '/api/platform?resource=opportunities&id=:id' },
      { source: '/api/opportunities', destination: '/api/platform?resource=opportunities' },
      { source: '/api/saved/:id', destination: '/api/platform?resource=saved&id=:id' },
      { source: '/api/saved', destination: '/api/platform?resource=saved' },
      { source: '/api/applications/:id', destination: '/api/platform?resource=applications&id=:id' },
      { source: '/api/applications', destination: '/api/platform?resource=applications' },
      { source: '/api/profile', destination: '/api/platform?resource=profile' },
      { source: '/api/notifications', destination: '/api/platform?resource=notifications' },
    ];
  },
};
export default nextConfig;
