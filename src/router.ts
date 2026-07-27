export type Route = { name: 'home' } | { name: 'demo'; id: string };

/**
 * Parses `location.hash` into a Route. Defaults to home for anything unrecognized.
 *
 * The query is stripped before the path is split: the headless capture URL carries its flag in
 * the hash (`#/demo/<id>?capture=1`), and without this the id keeps the `?capture=1` suffix,
 * matches no demo, and the run silently redirects to the gallery home page instead of failing.
 */
export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '').split('?')[0];
  if (!clean || clean === '') {
    return { name: 'home' };
  }
  const parts = clean.split('/').filter(Boolean);
  if (parts[0] === 'demo' && parts[1]) {
    return { name: 'demo', id: parts[1] };
  }
  return { name: 'home' };
}

export function currentRoute(): Route {
  return parseRoute(window.location.hash);
}

export function onRouteChange(handler: (route: Route) => void): () => void {
  const listener = (): void => handler(currentRoute());
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}
