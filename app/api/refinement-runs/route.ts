import { verifyAccessJwt } from '../capture-view/access';
import { getConfig, getStore } from '../capture-view/store';
import {
  createRun,
  getRun,
  isWorkflowHost,
  listRuns,
  modelExists,
  type RefinementRun,
  updateRun,
} from './store';

const FOCUSES = new Set(['shape', 'part', 'texture', 'detail', 'none']);
const TERMINAL = new Set(['cancelled', 'completed', 'stopped-early', 'needs-input', 'failed']);
const bad = (error: string, status = 400): Response => Response.json({ error }, { status });

async function authorize(request: Request): Promise<{ ok: true; email: string } | { ok: false; response: Response }> {
  const teamDomain = await getConfig('ACCESS_TEAM_DOMAIN');
  const aud = await getConfig('ACCESS_AUD');
  if (!teamDomain || !aud) {
    return { ok: false, response: bad('workflow writes require ACCESS_TEAM_DOMAIN and ACCESS_AUD', 503) };
  }
  const access = await verifyAccessJwt(request, { teamDomain, aud });
  if (!access.ok) {
    return { ok: false, response: bad(`Cloudflare Access check failed: ${access.reason}`, 403) };
  }
  return { ok: true, email: access.email ?? 'authenticated-user' };
}

export async function GET(request: Request): Promise<Response> {
  if (!(await isWorkflowHost())) {
    return Response.json(
      { available: false, error: 'refinement runs require the self-hosted writable checkout' },
      { status: 501 },
    );
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (id) {
    const run = await getRun(id);
    return run ? Response.json({ available: true, run }) : bad(`unknown run '${id}'`, 404);
  }
  const model = url.searchParams.get('model') ?? undefined;
  return Response.json({ available: true, runs: await listRuns(model) });
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isWorkflowHost())) return bad('refinement runs require a self-hosted checkout', 501);
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return bad('request body is not valid JSON');
  }

  if (body.action === 'cancel') {
    if (typeof body.id !== 'string') return bad('cancel requires a run id');
    const run = await getRun(body.id);
    if (!run) return bad(`unknown run '${body.id}'`, 404);
    if (TERMINAL.has(run.status)) return Response.json({ run });
    const status = run.status === 'queued' ? 'cancelled' : 'cancelling';
    const next = await updateRun(
      run,
      {
        cancelRequested: true,
        status,
        ...(status === 'cancelled' ? { finishedAt: new Date().toISOString() } : {}),
      },
      'cancel-requested',
    );
    return Response.json({ run: next });
  }

  const model = body.model;
  const budget = body.iterationBudget;
  const focus = body.focus;
  const target = typeof body.target === 'string' ? body.target.trim() : '';
  if (typeof model !== 'string' || !(await modelExists(model))) return bad('unknown demo model');
  if (!Number.isSafeInteger(budget) || (budget as number) < 1) {
    return bad('iterationBudget must be a positive safe integer');
  }
  if (typeof focus !== 'string' || !FOCUSES.has(focus)) return bad('invalid focus');
  if ((focus === 'part' || focus === 'detail') && !target) {
    return bad(`target is required for focus '${focus}'`);
  }
  const store = await getStore();
  if (!store || store.kind !== 'fs') return bad('saved local capture-view storage is unavailable', 503);
  const captureView = await store.get(model);
  if (!captureView) return bad('save a capture angle in the demo before starting a run', 409);

  const run = await createRun({
    model,
    iterationBudget: budget as number,
    focus: focus as RefinementRun['focus'],
    target: target || null,
    createdBy: auth.email,
    captureView,
  });
  return Response.json({ run }, { status: 201 });
}

export async function PATCH(request: Request): Promise<Response> {
  if (!(await isWorkflowHost())) return bad('refinement runs require a self-hosted checkout', 501);
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return bad('request body is not valid JSON');
  }
  if (typeof body.id !== 'string') return bad('run id is required');
  const run = await getRun(body.id);
  if (!run) return bad(`unknown run '${body.id}'`, 404);
  if (body.revision !== run.revision) return bad('run changed; reload before editing', 409);
  if (TERMINAL.has(run.status)) return bad('a terminal run cannot be edited', 409);
  const budget = body.iterationBudget;
  if (!Number.isSafeInteger(budget) || (budget as number) < 1) {
    return bad('iterationBudget must be a positive safe integer');
  }
  const minimum = run.currentIteration === null
    ? run.completedIterations
    : run.completedIterations + 1;
  if ((budget as number) < Math.max(1, minimum)) {
    return bad(`iterationBudget cannot be below ${Math.max(1, minimum)} for this run`, 409);
  }
  const next = await updateRun(
    run,
    { iterationBudget: budget as number },
    'iteration-budget-updated',
  );
  return Response.json({ run: next });
}
