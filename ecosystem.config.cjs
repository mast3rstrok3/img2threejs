/**
 * pm2 service for the self-hosted production gallery.
 *
 * Serves the built app on 127.0.0.1 only — it is published by adding an ingress rule to the
 * cloudflared tunnel, never by binding a public interface. Setup: docs/deploy-tunnel.md.
 *
 * ACCESS_TEAM_DOMAIN / ACCESS_AUD gate the capture-view write endpoint: the route verifies the
 * Cloudflare Access JWT itself rather than trusting that Access is in front of it. Blank them and
 * writes are refused outright — a half-finished setup fails closed rather than exposing an
 * unauthenticated write into the repo.
 */
// Per-machine values (port, Access team domain, AUD). Untracked: this repo is a public fork and
// those are deployment facts, not project configuration. Missing file => empty Access config =>
// the write endpoint refuses writes, which is the correct default for an unconfigured checkout.
let local = {};
try {
  local = require('./deploy.local.cjs');
} catch {
  // no local deployment config — fine for a plain checkout
}

module.exports = {
  apps: [
    {
      name: 'image2threejs',
      cwd: __dirname,
      script: 'node_modules/.bin/vinext',
      // --hostname, not a HOST env var: `vinext start` only reads HOST in the standalone build,
      // and its default is 0.0.0.0 — which would put the app on every interface of this box,
      // reachable from the LAN without going through the tunnel or Access at all.
      args: 'start --hostname 127.0.0.1',
      env: {
        NODE_ENV: 'production',
        PORT: '9110',
        ACCESS_TEAM_DOMAIN: '',
        ACCESS_AUD: '',
        ...local,
      },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'image2threejs-workflow-worker',
      cwd: __dirname,
      script: 'python3',
      args: '-m forge.workflows.worker',
      env: {
        NODE_ENV: 'production',
        IMG2THREEJS_WORKFLOW_POLL_SECONDS: '2',
        ...local,
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
