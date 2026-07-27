/**
 * Template for `deploy.local.cjs` (gitignored) — per-machine deployment values.
 *
 *   cp deploy.local.example.cjs deploy.local.cjs
 *
 * Leaving ACCESS_* empty is safe: the capture-view write endpoint refuses writes without them,
 * so an unconfigured checkout fails closed. See docs/deploy-tunnel.md.
 */
module.exports = {
  PORT: '9110',
  // <team>.cloudflareaccess.com — the redirect target when you curl the gated hostname
  ACCESS_TEAM_DOMAIN: '',
  // Application Audience (AUD) Tag — the `kid=` parameter in that same redirect
  ACCESS_AUD: '',
};
