import { currentRoute, onRouteChange } from './router';
import { renderHome } from './views/home';
import { renderDemo } from './views/demo';

export function bootstrap(app: HTMLElement): () => void {
  let cleanupCurrentRoute: (() => void) | null = null;

  function render(): void {
    if (cleanupCurrentRoute) {
      cleanupCurrentRoute();
      cleanupCurrentRoute = null;
    }

    const route = currentRoute();
    if (route.name === 'demo') {
      cleanupCurrentRoute = renderDemo(app, route.id);
    } else {
      cleanupCurrentRoute = renderHome(app);
    }
  }

  const removeRouteListener = onRouteChange(render);
  render();

  return () => {
    removeRouteListener();
    cleanupCurrentRoute?.();
    cleanupCurrentRoute = null;
    app.replaceChildren();
  };
}
