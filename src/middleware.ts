// =============================================================================
// EdTechia — Auth Middleware
// Protects all routes except:
//   - /login
//   - /api/auth/*  (NextAuth callbacks)
//   - /_next/*     (Next.js assets)
//   - Static files
// =============================================================================

export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
};
