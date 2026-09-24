import * as THREE from 'three';
import { getDemo } from '../demos/registry';
import { Viewer, type CaptureView, type PartInfo } from '../scene';
import { navigate } from '../router';

const GITHUB_URL = 'https://github.com/hoainho/img2threejs';

/**
 * Reads a demo's authored review viewpoint.
 *
 * Goes through the API rather than straight to the static file, because the answer depends on
 * where it is running: locally the dev middleware reads `public/capture-views/<id>.json`, in
 * production the Worker reads KV and falls back to that same committed asset. One call either way.
 * The static path stays as a last resort so a capture still frames correctly if the API is down.
 */
async function fetchCaptureView(id: string): Promise<unknown> {
  for (const url of [`/api/capture-view?model=${encodeURIComponent(id)}`, `/capture-views/${id}.json`]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch {
      // try the next source
    }
  }
  throw new Error('no capture view available');
}

/** Viewports where the info panel becomes a collapsible bottom sheet over the model. */
const COMPACT_QUERY = '(max-width: 860px), (max-height: 520px)';

/**
 * Whether the details sheet is expanded, remembered across demo navigations within a session.
 * `null` = untouched, so each viewport gets its own sensible default (open on desktop, collapsed
 * on a phone, where an open panel would cover the model entirely).
 */
let panelExpanded: boolean | null = null;

/**
 * Renders the full-viewport demo viewer + info panel for `id`.
 * Returns a cleanup function the router must call before switching routes.
 * If `id` is unknown, redirects to home and returns a no-op cleanup.
 */
export function renderDemo(mount: HTMLElement, id: string): () => void {
  const demo = getDemo(id);
  if (!demo) {
    navigate('#/');
    return () => {};
  }

  const compact = window.matchMedia(COMPACT_QUERY);
  const expanded = panelExpanded ?? !compact.matches;

  mount.innerHTML = `
    <div class="demo-page">
      <div class="demo-canvas-mount" id="demo-canvas-mount"></div>
      <img class="ref-overlay" id="ref-overlay" src="${demo.referenceImage}" alt="" hidden />
      <section class="demo-panel" id="demo-panel" data-expanded="${expanded}">
        <div class="demo-panel-bar">
          <a class="back-link" href="#/" aria-label="Back to gallery">
            <span class="back-arrow" aria-hidden="true">&larr;</span>
            <span class="back-text">Back to gallery</span>
          </a>
          <span class="demo-bar-title">${demo.title}</span>
          <button class="panel-toggle" type="button" id="panel-toggle"
                  aria-controls="demo-panel-body" aria-expanded="${expanded}">
            <span class="panel-toggle-label">Details</span>
            <span class="panel-toggle-chevron" aria-hidden="true"></span>
          </button>
        </div>
        <div class="demo-panel-body" id="demo-panel-body">
          <div class="demo-panel-inner">
            <header class="demo-panel-head">
              <span class="demo-kicker">img2threejs · reconstruction</span>
              <h2>${demo.title}</h2>
              <p class="demo-author">by
                <a href="${demo.authorUrl}" target="_blank" rel="noopener noreferrer">${demo.author}</a>
              </p>
            </header>
            <figure class="demo-ref">
              <img class="demo-ref-thumb" src="${demo.referenceImage}" alt="${demo.title} reference" />
              <figcaption>source reference</figcaption>
            </figure>
            <div class="demo-meta">
              <div class="badges">
                <span class="badge badge-${demo.subjectClass}">${demo.subjectClass}</span>
                <span class="badge">${demo.generatedWith}</span>
                <span class="badge badge-status status-${demo.status}">${demo.status}</span>
              </div>
              <p>${demo.blurb}</p>
            </div>
            <section class="demo-parts" id="demo-parts" hidden>
              <div class="parts-head">
                <span class="parts-title">Parts</span>
                <span class="parts-count" id="parts-count"></span>
              </div>
              <div class="part-card" id="part-card" hidden></div>
              <div class="parts-scroll"><ul class="parts-list" id="parts-list"></ul></div>
              <p class="parts-prov" id="parts-prov" hidden></p>
            </section>
            <section class="capture-tools" id="capture-tools" hidden>
              <div class="capture-tools-head">
                <span class="capture-tools-title">Capture view</span>
                <span class="capture-tools-status" id="capture-status">checking…</span>
              </div>
              <p class="capture-tools-hint">
                Orbit until the model sits on the reference, then save. Every evaluation
                screenshot is taken from this angle.
                <span class="capture-frame" id="capture-frame"></span>
              </p>
              <label class="capture-overlay-row">
                <input type="checkbox" id="ref-overlay-toggle" />
                <span>Overlay reference</span>
              </label>
              <input class="capture-overlay-range" id="ref-overlay-opacity" type="range"
                     min="0" max="100" value="45" aria-label="Reference overlay opacity" />
              <div class="capture-tools-actions">
                <button class="btn capture-btn" type="button" id="capture-view-save">Set capture view</button>
                <button class="btn capture-btn" type="button" id="capture-view-load">Load saved</button>
              </div>
            </section>
            <section class="refinement-tools" id="refinement-tools" hidden>
              <div class="capture-tools-head">
                <span class="capture-tools-title">Refinement runs</span>
                <span class="capture-tools-status" id="refinement-status">checking…</span>
              </div>
              <p class="capture-tools-hint">
                Each loop runs <code>SKILL.md</code> to completion. The saved capture angle is
                locked when the run starts.
              </p>
              <form class="refinement-form" id="refinement-form">
                <label>
                  <span>Loops</span>
                  <input id="refinement-loops" type="number" min="1" step="1" value="3" required />
                </label>
                <label>
                  <span>Focus</span>
                  <select id="refinement-focus">
                    <option value="none">Highest gap</option>
                    <option value="shape">Shape</option>
                    <option value="part">Part</option>
                    <option value="texture">Texture</option>
                    <option value="detail">Detail</option>
                  </select>
                </label>
                <label class="refinement-target-row" id="refinement-target-row" hidden>
                  <span>Target</span>
                  <input id="refinement-target" type="text" placeholder="Name the part or detail" />
                </label>
                <button class="btn capture-btn" id="refinement-start" type="submit">Start run</button>
              </form>
              <div class="refinement-run-row" id="refinement-run-row" hidden></div>
              <div class="refinement-detail" id="refinement-detail" hidden></div>
            </section>
            <div class="demo-links">
              <button class="btn btn-explode" id="demo-explode" type="button" aria-pressed="false" hidden>
                <span class="explode-glyph">&#10021;</span> <span class="explode-label">Explode parts</span>
              </button>
              <a class="btn" href="${demo.sourceUrl}" target="_blank" rel="noopener noreferrer">
                &lt;/&gt; View generated source
              </a>
              <a class="btn btn-star" href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer">
                &#9733; Star img2threejs on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>
      <div class="hint" id="demo-hint">
        <span class="hint-glyph" aria-hidden="true">&#8635;</span>
        <span class="hint-pointer">drag to orbit &middot; scroll to zoom</span>
        <span class="hint-touch">drag to orbit &middot; pinch to zoom</span>
      </div>
    </div>
  `;

  // Per-demo theming: tint the panel accent to the object's signature colour.
  if (demo.accent) {
    const page = mount.querySelector<HTMLElement>('.demo-page');
    page?.style.setProperty('--accent', demo.accent);
    page?.style.setProperty('--accent-strong', demo.accent);
    page?.classList.add('demo-themed');
  }

  // Headless-evaluation capture mode: `#/demo/<id>?capture=1` renders on a flat white studio
  // background with a frozen camera for the Divine Eye reference loop. Default off (normal viewing).
  const capture = /[?&]capture=1\b/.test(window.location.hash) ||
    new URLSearchParams(window.location.search).get('capture') === '1';

  // Per-demo tone-mapping (optional on the entry; read structurally so demo.ts is independent of
  // the DemoEntry field being declared). AgX preserves the Ruby-Doppler crimson that ACES washes.
  const toneMapping = (demo as { toneMapping?: 'aces' | 'agx' | 'neutral' }).toneMapping;

  const canvasMount = mount.querySelector<HTMLDivElement>('#demo-canvas-mount')!;
  const viewer = new Viewer(canvasMount, {
    cameraPosition: demo.cameraPosition,
    cameraTarget: demo.cameraTarget,
    cameraFov: demo.cameraFov,
    backgroundGradient: demo.backgroundGradient,
    exposure: demo.exposure,
    environmentIntensity: demo.environmentIntensity,
    installLights: demo.installLights,
    toneMapping,
    capture,
  });

  const model = demo.build(viewer.scene);
  viewer.setExplodeRoot(model);
  // Responsive framing: keeps the authored desktop composition, dollies back on narrow/short
  // viewports so the whole subject stays in frame instead of being cropped away.
  viewer.fitToViewport(model);

  // Part tree published for the assembly gate (forge/stage4_review/check_part_coverage.py).
  // Set in capture mode too — that is the headless run the gate reads it from.
  (window as unknown as Record<string, unknown>).__IMG2THREEJS_PARTS__ = {
    model: id,
    ...viewer.partManifest(),
  };

  // Explode control. Hidden for single-mesh demos and in capture mode, where the panel is
  // hidden anyway and the evaluation frame must stay deterministic.
  const explodeBtn = mount.querySelector<HTMLButtonElement>('#demo-explode');
  if (explodeBtn && viewer.canExplode && !capture) {
    explodeBtn.hidden = false;
    let exploded = false;
    explodeBtn.addEventListener('click', () => {
      exploded = !exploded;
      viewer.setExplode(exploded ? 1 : 0);
      explodeBtn.setAttribute('aria-pressed', String(exploded));
      explodeBtn.classList.toggle('is-active', exploded);
      explodeBtn.querySelector('.explode-label')!.textContent = exploded ? 'Assemble' : 'Explode parts';
    });
  }

  // Part inspector: click any component in the viewer (or in the list) to select, name and
  // isolate it. Off in capture mode — the evaluation frame must show the assembled object.
  const partsSection = mount.querySelector<HTMLElement>('#demo-parts')!;
  const partsList = mount.querySelector<HTMLUListElement>('#parts-list')!;
  const partCard = mount.querySelector<HTMLElement>('#part-card')!;

  /** Small DOM builder. Part names and material strings go in as text, never as markup. */
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K, cls?: string, text?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const fact = (label: string, value: string): HTMLElement => {
    const row = el('div');
    row.append(el('dt', undefined, label), el('dd', undefined, value));
    return row;
  };

  const renderSelection = (sel: PartInfo | null): void => {
    for (const item of partsList.querySelectorAll<HTMLElement>('.part-item')) {
      item.classList.toggle('is-active', !!sel && item.dataset.part === sel.name);
    }
    if (!sel) {
      partCard.hidden = true;
      partCard.replaceChildren();
      return;
    }
    partCard.hidden = false;

    const head = el('div', 'part-card-head');
    head.append(el('strong', undefined, sel.name), el('span', `part-kind part-kind-${sel.kind}`, sel.kind));

    const facts = el('dl', 'part-facts');
    if (sel.module) facts.append(fact('module', sel.module));
    facts.append(fact('triangles', sel.triangles.toLocaleString()));
    for (const m of sel.materials) facts.append(fact('material', m));

    const isolateBtn = el('button', 'btn part-btn', viewer.isolated ? 'Show all' : 'Isolate');
    isolateBtn.type = 'button';
    isolateBtn.setAttribute('aria-pressed', String(viewer.isolated));
    // No manual re-render: setIsolate reports back through onSelect.
    isolateBtn.addEventListener('click', () => viewer.setIsolate(!viewer.isolated));
    const clearBtn = el('button', 'btn part-btn', 'Clear');
    clearBtn.type = 'button';
    clearBtn.addEventListener('click', () => {
      viewer.setIsolate(false);
      viewer.selectByName(null);
    });
    const actions = el('div', 'part-actions');
    actions.append(isolateBtn, clearBtn);

    partCard.replaceChildren(head, facts, actions);
    partsList.querySelector('.part-item.is-active')?.scrollIntoView({ block: 'nearest' });
  };

  if (!capture) {
    viewer.enableInspect({ onSelect: renderSelection });
    const parts = viewer.parts;
    // One nameless blob is not a part tree — leave the section hidden rather than show a list
    // of one. This is what keeps the demos with unnamed meshes from looking broken.
    if (parts.length > 1) {
      partsSection.hidden = false;
      mount.querySelector<HTMLElement>('#parts-count')!.textContent = String(parts.length);

      const groups = new Map<string, PartInfo[]>();
      for (const p of parts) {
        const key = p.module ?? 'ungrouped';
        let arr = groups.get(key);
        if (!arr) groups.set(key, (arr = []));
        arr.push(p);
      }
      const labelled = groups.size > 1 || !groups.has('ungrouped');
      for (const [mod, items] of groups) {
        if (labelled) partsList.append(el('li', 'parts-group', mod));
        for (const p of items) {
          const btn = el('button', 'part-item');
          btn.type = 'button';
          btn.dataset.part = p.name;
          btn.append(
            el('span', 'part-name', p.name),
            el('span', 'part-tri', p.triangles >= 1000
              ? `${(p.triangles / 1000).toFixed(1)}k` : String(p.triangles)),
          );
          const row = el('li');
          row.append(btn);
          partsList.append(row);
        }
      }

      partsList.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.part-item');
        if (btn?.dataset.part) viewer.selectByName(btn.dataset.part);
      });

      // Model-level, not per-part: this is what the pipeline recorded about the whole
      // reconstruction, and it is the honest caption for every number above it.
      const prov = viewer.provenance;
      if (prov) {
        const provEl = mount.querySelector<HTMLElement>('#parts-prov')!;
        provEl.hidden = false;
        provEl.textContent = [
          prov.route,
          prov.exactnessTier,
          prov.thicknessConfidence !== undefined
            ? `z-depth confidence ${prov.thicknessConfidence}` : null,
        ].filter(Boolean).join(' · ');
      }

      // Wrapped in its own span so the compact layout can drop it: the hint is a single-line
      // pill, and this clause alone is wider than a phone screen.
      const inspectHint = document.createElement('span');
      inspectHint.className = 'hint-extra';
      inspectHint.textContent =
        ' · click a part to inspect · click again to reach what is behind it';
      mount.querySelector<HTMLElement>('.hint')!.append(inspectHint);
    }
  }

  // Deferred until the saved review viewpoint has been fetched and applied — otherwise the
  // headless screenshot races the fetch and captures the demo's authored camera instead.
  let readyGate: Promise<unknown> | undefined;

  if (capture) {
    // Flat white bg + hide the UI overlay + freeze per-frame animation so the evaluation
    // frame is deterministic and shows only the object (matches the reference plate).
    viewer.scene.background = new THREE.Color(0xffffff);
    viewer.scene.traverse((o) => {
      if ((o.userData as { tick?: unknown }).tick) delete (o.userData as { tick?: unknown }).tick;
    });
    for (const sel of ['.demo-panel', '.hint']) {
      mount.querySelector<HTMLElement>(sel)?.style.setProperty('display', 'none');
    }
    readyGate = applyCaptureView(viewer, id);
    // Exposed for `scripts/capture.mjs --orbit`, which yaws the saved view to produce the extra
    // angles the "multi-angle or it didn't happen" gate needs. Capture mode only — this is a
    // headless-evaluation handle, not public API.
    (window as unknown as Record<string, unknown>).__IMG2THREEJS_VIEWER__ = viewer;
  }

  let refinementCleanup: (() => void) | undefined;
  if (!capture) {
    installCaptureTools(mount, viewer, id);
    refinementCleanup = installRefinementTools(mount, id);
  }

  viewer.start(readyGate);

  // --- collapsible details sheet ---------------------------------------------------------
  const panel = mount.querySelector<HTMLElement>('#demo-panel')!;
  const bar = mount.querySelector<HTMLElement>('.demo-panel-bar')!;
  const toggle = mount.querySelector<HTMLButtonElement>('#panel-toggle')!;
  const setExpanded = (next: boolean): void => {
    panelExpanded = next;
    panel.dataset.expanded = String(next);
    toggle.setAttribute('aria-expanded', String(next));
  };
  // The whole bar is the hit target (the button's click bubbles up to it), so a sheet on a phone
  // toggles from anywhere along the header — everywhere except the back link.
  const onBarClick = (event: MouseEvent): void => {
    if ((event.target as HTMLElement).closest('.back-link')) return;
    setExpanded(panel.dataset.expanded !== 'true');
  };
  bar.addEventListener('click', onBarClick);

  // Viewport changes reset an untouched panel to that viewport's default (rotating a phone to
  // landscape, resizing a window across the breakpoint).
  const onCompactChange = (event: MediaQueryListEvent): void => {
    if (panelExpanded === null) setExpanded(!event.matches);
  };
  compact.addEventListener('change', onCompactChange);

  // --- orbit hint: says its piece, then gets out of the way ------------------------------
  const hint = mount.querySelector<HTMLElement>('#demo-hint')!;
  const hideHint = (): void => hint.classList.add('is-gone');
  const hintTimer = window.setTimeout(hideHint, 6000);
  canvasMount.addEventListener('pointerdown', hideHint, { once: true });

  return () => {
    window.clearTimeout(hintTimer);
    bar.removeEventListener('click', onBarClick);
    compact.removeEventListener('change', onCompactChange);
    canvasMount.removeEventListener('pointerdown', hideHint);
    refinementCleanup?.();
    viewer.dispose();
  };
}

const isVec3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/**
 * A saved view drives the camera directly, so a malformed file is not a cosmetic problem — one
 * NaN and the render is a blank frame that still passes the ready handshake and gets scored.
 */
function isCaptureView(v: unknown): v is CaptureView {
  const c = v as CaptureView | null;
  return !!c && typeof c === 'object'
    && isVec3(c.position) && isVec3(c.target)
    && typeof c.fov === 'number' && Number.isFinite(c.fov) && c.fov > 0 && c.fov < 180;
}

/**
 * Capture-mode framing: use this demo's authored review viewpoint when one exists, else fall
 * back to bbox auto-framing.
 *
 * Publishes `window.__IMG2THREEJS_VIEW_SOURCE__` either way. That flag is not decoration — the
 * refine loop records it, because a `fallback` render was framed by arithmetic rather than
 * aligned to the reference, so it is not comparable across runs and must not be quietly scored
 * as though it were.
 */
async function applyCaptureView(viewer: Viewer, id: string): Promise<void> {
  const w = window as unknown as { __IMG2THREEJS_VIEW_SOURCE__?: string };
  try {
    const view = await fetchCaptureView(id);
    if (!isCaptureView(view)) throw new Error('malformed capture view');
    viewer.setView(view);
    w.__IMG2THREEJS_VIEW_SOURCE__ = 'saved';
  } catch {
    viewer.frameForCapture();
    w.__IMG2THREEJS_VIEW_SOURCE__ = 'fallback';
  }
}

/**
 * Authoring controls for the review viewpoint: overlay the reference photo on the live canvas,
 * orbit until the silhouettes agree, then persist the pose.
 *
 * The overlay is the part that makes this practical — "align the camera with the photo" is
 * guesswork against a thumbnail and obvious when the photo is sitting on top of the model.
 *
 * Available in the deployed app too, not just locally: positioning a model is the one step of the
 * refine loop that needs a human eye, and it should not require a checkout. Where the pose lands
 * differs (repo file locally, KV in production) but the control is the same. The deployed app is
 * gated by Cloudflare Access, and the write endpoint verifies that token itself.
 */
function installCaptureTools(mount: HTMLElement, viewer: Viewer, id: string): void {
  const tools = mount.querySelector<HTMLElement>('#capture-tools');
  const status = mount.querySelector<HTMLElement>('#capture-status');
  const overlay = mount.querySelector<HTMLImageElement>('#ref-overlay');
  const toggle = mount.querySelector<HTMLInputElement>('#ref-overlay-toggle');
  const opacity = mount.querySelector<HTMLInputElement>('#ref-overlay-opacity');
  const saveBtn = mount.querySelector<HTMLButtonElement>('#capture-view-save');
  const loadBtn = mount.querySelector<HTMLButtonElement>('#capture-view-load');
  if (!tools || !status || !overlay || !toggle || !opacity || !saveBtn || !loadBtn) return;

  tools.hidden = false;

  const setStatus = (text: string, kind: 'ok' | 'warn' | 'err' | 'idle' = 'idle'): void => {
    status.textContent = text;
    status.dataset.kind = kind;
  };

  const applyOpacity = (): void => {
    overlay.style.opacity = String(Number(opacity.value) / 100);
  };
  applyOpacity();
  opacity.addEventListener('input', applyOpacity);

  // The capture frame takes the REFERENCE's aspect, not a fixed 16:9. Half the reference plates
  // in this repo are not 16:9, and rendering them into a 16:9 frame changes the composition even
  // when the camera angle is right — which trips diagnose_render.py's aspect and scale HARD
  // gates on a framing artifact instead of a real defect. See render_capture.md,
  // "Reference Framing Match".
  const captureSize = { width: 1600, height: 900 };
  const page = mount.querySelector<HTMLElement>('.demo-page');
  const canvasMount = mount.querySelector<HTMLElement>('#demo-canvas-mount');

  const adoptReferenceAspect = (): void => {
    const w = overlay.naturalWidth;
    const h = overlay.naturalHeight;
    if (!w || !h) return;
    // Long edge 1600, preserving the reference's aspect. Even numbers keep encoders happy.
    const scale = 1600 / Math.max(w, h);
    captureSize.width = Math.max(2, Math.round((w * scale) / 2) * 2);
    captureSize.height = Math.max(2, Math.round((h * scale) / 2) * 2);
    page?.style.setProperty('--capture-aspect', String(w / h));
    const frame = mount.querySelector<HTMLElement>('#capture-frame');
    if (frame) frame.textContent = `Capture frame ${captureSize.width}x${captureSize.height}, matching the reference.`;
  };
  if (overlay.complete) adoptReferenceAspect();
  else overlay.addEventListener('load', adoptReferenceAspect, { once: true });

  // Raising the overlay does three things, all so that what you align is exactly what gets
  // captured: flat white stage (difference blending only reads against a light background, and
  // it is what the capture render uses), and the canvas letterboxed to the reference's aspect so
  // the live camera has the capture frame's aspect rather than the browser window's.
  const stageBackground = viewer.scene.background;
  toggle.addEventListener('change', () => {
    const on = toggle.checked;
    overlay.hidden = !on;
    viewer.scene.background = on ? new THREE.Color(0xffffff) : stageBackground;
    canvasMount?.classList.toggle('is-framed', on);
    overlay.classList.toggle('is-framed', on);
    viewer.resize();
  });

  const loadView = async (): Promise<void> => {
    try {
      const view = await fetchCaptureView(id);
      if (!isCaptureView(view)) return setStatus('saved view is malformed', 'err');
      viewer.setView(view);
      setStatus('saved view applied', 'ok');
    } catch {
      setStatus('no saved view yet', 'warn');
    }
  };

  const saveView = async (): Promise<void> => {
    setStatus('saving…');
    try {
      const res = await fetch('/api/capture-view', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Viewport = the reference's aspect (see adoptReferenceAspect), so the captured frame is
        // composition-comparable to the photo and not just angle-comparable.
        body: JSON.stringify({ model: id, ...viewer.getView(), ...captureSize }),
      });
      const body = await res.json().catch(() => ({})) as { error?: string; storage?: string };
      if (!res.ok) return setStatus(body.error ?? `save failed (${res.status})`, 'err');
      // Where it landed differs by environment, and the difference matters: a pose saved into KV
      // is not in the repo yet, so say what still has to happen rather than implying it is done.
      setStatus(
        body.storage === 'kv'
          ? 'saved to KV · run `npm run capture-views:pull`'
          : `saved → public/capture-views/${id}.json`,
        'ok',
      );
    } catch (err) {
      setStatus(`save failed: ${(err as Error).message}`, 'err');
    }
  };

  saveBtn.addEventListener('click', () => void saveView());
  loadBtn.addEventListener('click', () => void loadView());

  // Report whether an angle is already on file, without moving the camera the user is looking at.
  void fetchCaptureView(id)
    .then(() => setStatus('saved view on file', 'ok'))
    .catch(() => setStatus('not set yet', 'warn'));
}

type RefinementRun = {
  id: string;
  revision: number;
  model: string;
  iterationBudget: number;
  completedIterations: number;
  currentIteration: number | null;
  focus: string;
  target: string | null;
  status: string;
  latestScore: number | null;
  latestSummary?: string | null;
  remainingMismatch?: string[];
  branch: string;
  stopReason: string | null;
  createdAt: string;
};

/** Self-hosted workflow controls. Cloudflare-only deployments report the capability as absent. */
function installRefinementTools(mount: HTMLElement, model: string): () => void {
  const section = mount.querySelector<HTMLElement>('#refinement-tools')!;
  const status = mount.querySelector<HTMLElement>('#refinement-status')!;
  const form = mount.querySelector<HTMLFormElement>('#refinement-form')!;
  const loops = mount.querySelector<HTMLInputElement>('#refinement-loops')!;
  const focus = mount.querySelector<HTMLSelectElement>('#refinement-focus')!;
  const targetRow = mount.querySelector<HTMLElement>('#refinement-target-row')!;
  const target = mount.querySelector<HTMLInputElement>('#refinement-target')!;
  const start = mount.querySelector<HTMLButtonElement>('#refinement-start')!;
  const row = mount.querySelector<HTMLElement>('#refinement-run-row')!;
  const detail = mount.querySelector<HTMLElement>('#refinement-detail')!;
  section.hidden = false;

  let runs: RefinementRun[] = [];
  let selectedId: string | null = null;
  let timer: number | undefined;
  let disposed = false;
  const terminal = new Set(['cancelled', 'completed', 'stopped-early', 'needs-input', 'failed']);

  const setStatus = (text: string, kind: 'ok' | 'warn' | 'err' | 'idle' = 'idle'): void => {
    status.textContent = text;
    status.dataset.kind = kind;
  };

  const node = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const request = async (method: string, body?: unknown): Promise<Record<string, unknown>> => {
    const res = await fetch(
      method === 'GET'
        ? `/api/refinement-runs?model=${encodeURIComponent(model)}`
        : '/api/refinement-runs',
      {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      },
    );
    const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `request failed (${res.status})`);
    return payload;
  };

  const renderDetail = (): void => {
    const run = runs.find((item) => item.id === selectedId);
    detail.replaceChildren();
    detail.hidden = !run;
    if (!run) return;

    const head = node('div', 'refinement-detail-head');
    head.append(
      node('strong', undefined, `Run ${run.id.slice(-8)}`),
      node('span', `run-state run-state-${run.status}`, run.status),
    );
    const facts = node('div', 'refinement-facts');
    facts.append(
      node('span', undefined, `${run.completedIterations}/${run.iterationBudget} complete`),
      node('span', undefined, `focus · ${run.focus}${run.target ? ` · ${run.target}` : ''}`),
    );
    if (run.latestScore !== null) facts.append(node('span', undefined, `vision · ${run.latestScore.toFixed(2)}`));
    if (run.latestSummary) facts.append(node('p', undefined, run.latestSummary));
    if (run.stopReason) facts.append(node('p', 'refinement-error', run.stopReason));
    if (run.remainingMismatch?.length) {
      facts.append(node('p', undefined, `Still mismatched: ${run.remainingMismatch.join('; ')}`));
    }
    if (run.branch) facts.append(node('code', undefined, run.branch));

    if (!terminal.has(run.status)) {
      const controls = node('div', 'refinement-edit');
      const label = node('label');
      label.append(node('span', undefined, 'Total loops'));
      const input = node('input');
      input.type = 'number';
      input.min = String(Math.max(1, run.completedIterations + (run.currentIteration ? 1 : 0)));
      input.step = '1';
      input.value = String(run.iterationBudget);
      label.append(input);
      const save = node('button', 'btn capture-btn', 'Update');
      save.type = 'button';
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          await request('PATCH', {
            id: run.id,
            revision: run.revision,
            iterationBudget: Number(input.value),
          });
          await refresh();
        } catch (error) {
          setStatus((error as Error).message, 'err');
        } finally {
          save.disabled = false;
        }
      });
      const cancel = node('button', 'btn capture-btn refinement-cancel', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', async () => {
        cancel.disabled = true;
        try {
          await request('POST', { action: 'cancel', id: run.id });
          await refresh();
        } catch (error) {
          setStatus((error as Error).message, 'err');
        } finally {
          cancel.disabled = false;
        }
      });
      controls.append(label, save, cancel);
      detail.append(head, facts, controls);
    } else {
      detail.append(head, facts);
    }
  };

  const renderRuns = (): void => {
    row.replaceChildren();
    row.hidden = runs.length === 0;
    for (const run of runs) {
      const card = node('button', 'refinement-run-card');
      card.type = 'button';
      card.classList.toggle('is-active', run.id === selectedId);
      card.append(
        node('strong', undefined, run.id.slice(-8)),
        node('span', undefined, `${run.completedIterations}/${run.iterationBudget} · ${run.status}`),
      );
      card.addEventListener('click', () => {
        selectedId = run.id;
        renderRuns();
        renderDetail();
      });
      row.append(card);
    }
    renderDetail();
  };

  const schedule = (): void => {
    if (timer) window.clearTimeout(timer);
    if (!disposed && runs.some((run) => !terminal.has(run.status))) {
      timer = window.setTimeout(() => void refresh(), 2500);
    }
  };

  const refresh = async (): Promise<void> => {
    try {
      const payload = await request('GET');
      runs = (payload.runs as RefinementRun[] | undefined) ?? [];
      if (selectedId && !runs.some((run) => run.id === selectedId)) selectedId = null;
      if (!selectedId && runs.length) selectedId = runs[0].id;
      start.disabled = false;
      setStatus(runs.some((run) => !terminal.has(run.status)) ? 'worker active' : 'ready', 'ok');
      renderRuns();
      schedule();
    } catch (error) {
      start.disabled = true;
      setStatus((error as Error).message, 'warn');
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((el) => {
        el.disabled = true;
      });
    }
  };

  const updateTarget = (): void => {
    const needed = focus.value === 'part' || focus.value === 'detail';
    targetRow.hidden = !needed;
    target.required = needed;
  };
  focus.addEventListener('change', updateTarget);
  updateTarget();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    start.disabled = true;
    setStatus('queueing…');
    try {
      const payload = await request('POST', {
        model,
        iterationBudget: Number(loops.value),
        focus: focus.value,
        target: target.value.trim() || null,
      });
      const created = payload.run as RefinementRun;
      selectedId = created.id;
      await refresh();
    } catch (error) {
      setStatus((error as Error).message, 'err');
      start.disabled = false;
    }
  });

  void refresh();
  return () => {
    disposed = true;
    if (timer) window.clearTimeout(timer);
  };
}
