/**
 * Filesystem-backed job store for the self-hosted workflow harness.
 *
 * Cloudflare Workers deliberately get no fallback: the skill needs a writable checkout, Codex,
 * npm, git and browser capture. Advertising a queue where none of those exist would be dishonest.
 */

export type RunStatus =
  | 'queued'
  | 'preflight'
  | 'running'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'stopped-early'
  | 'needs-input'
  | 'failed';

export interface RefinementRun {
  schemaVersion: 1;
  revision: number;
  id: string;
  workflow: 'skill-refinement';
  model: string;
  iterationBudget: number;
  completedIterations: number;
  currentIteration: number | null;
  focus: 'shape' | 'part' | 'texture' | 'detail' | 'none';
  target: string | null;
  status: RunStatus;
  captureViewSha256: string;
  branch: string;
  baselineCommit: string;
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  finishedAt: string | null;
  lastAction: 'continue' | 'refine-spec' | 'refine-code' | 'request-input' | 'stop' | null;
  stopReason: string | null;
  latestScore: number | null;
  latestSummary?: string | null;
  remainingMismatch?: string[];
  cancelRequested: boolean;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

async function root(): Promise<string | null> {
  try {
    const { cwd } = await import('node:process');
    const { access } = await import('node:fs/promises');
    const value = cwd();
    await access(`${value}/SKILL.md`);
    return value;
  } catch {
    return null;
  }
}

export async function isWorkflowHost(): Promise<boolean> {
  return (await root()) !== null;
}

async function paths() {
  const repo = await root();
  if (!repo) throw new Error('workflow runner is only available beside a writable checkout');
  return {
    repo,
    jobs: `${repo}/workbench/workflows/jobs`,
  };
}

export async function modelExists(model: string): Promise<boolean> {
  if (!SLUG.test(model)) return false;
  const { repo } = await paths();
  const { access, readdir } = await import('node:fs/promises');
  try {
    await access(`${repo}/src/demos/${model}`);
    const refs = await readdir(`${repo}/public/references`);
    return refs.some((name) => name.startsWith(`${model}.`));
  } catch {
    return false;
  }
}

export async function listRuns(model?: string): Promise<RefinementRun[]> {
  const { jobs } = await paths();
  const { readdir, readFile } = await import('node:fs/promises');
  let ids: string[];
  try {
    ids = await readdir(jobs);
  } catch {
    return [];
  }
  const result: RefinementRun[] = [];
  for (const id of ids) {
    try {
      const run = JSON.parse(await readFile(`${jobs}/${id}/job.json`, 'utf8')) as RefinementRun;
      if (!model || run.model === model) result.push(run);
    } catch {
      // A half-created directory is not a job. Atomic writes keep valid jobs readable.
    }
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRun(id: string): Promise<RefinementRun | null> {
  if (!SLUG.test(id)) return null;
  const { jobs } = await paths();
  const { readFile } = await import('node:fs/promises');
  try {
    return JSON.parse(await readFile(`${jobs}/${id}/job.json`, 'utf8')) as RefinementRun;
  } catch {
    return null;
  }
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  const { mkdir, rename, writeFile } = await import('node:fs/promises');
  const dir = path.slice(0, path.lastIndexOf('/'));
  await mkdir(dir, { recursive: true });
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temp, path);
}

export async function saveRun(run: RefinementRun): Promise<void> {
  const { jobs } = await paths();
  await atomicWrite(`${jobs}/${run.id}/job.json`, run);
}

export async function appendEvent(id: string, event: string, detail: object = {}): Promise<void> {
  const { jobs } = await paths();
  const { appendFile, mkdir } = await import('node:fs/promises');
  await mkdir(`${jobs}/${id}`, { recursive: true });
  await appendFile(
    `${jobs}/${id}/events.jsonl`,
    `${JSON.stringify({ at: new Date().toISOString(), event, ...detail })}\n`,
    'utf8',
  );
}

export async function createRun(input: {
  model: string;
  iterationBudget: number;
  focus: RefinementRun['focus'];
  target: string | null;
  createdBy: string;
  captureView: unknown;
}): Promise<RefinementRun> {
  const { jobs } = await paths();
  const { createHash, randomBytes } = await import('node:crypto');
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const id = `${stamp}-${randomBytes(4).toString('hex')}`;
  const locked = `${JSON.stringify(input.captureView, null, 2)}\n`;
  const captureViewSha256 = createHash('sha256').update(locked).digest('hex');
  const now = new Date().toISOString();
  const run: RefinementRun = {
    schemaVersion: 1,
    revision: 1,
    id,
    workflow: 'skill-refinement',
    model: input.model,
    iterationBudget: input.iterationBudget,
    completedIterations: 0,
    currentIteration: null,
    focus: input.focus,
    target: input.target,
    status: 'queued',
    captureViewSha256,
    branch: '',
    baselineCommit: '',
    createdBy: input.createdBy,
    createdAt: now,
    startedAt: null,
    updatedAt: now,
    finishedAt: null,
    lastAction: null,
    stopReason: null,
    latestScore: null,
    cancelRequested: false,
  };
  await atomicWrite(`${jobs}/${id}/capture-view.json`, input.captureView);
  await saveRun(run);
  await appendEvent(id, 'queued', { iterationBudget: input.iterationBudget });
  return run;
}

export async function updateRun(
  run: RefinementRun,
  change: Partial<RefinementRun>,
  event: string,
): Promise<RefinementRun> {
  const next = {
    ...run,
    ...change,
    revision: run.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  await saveRun(next);
  await appendEvent(run.id, event, change);
  return next;
}

