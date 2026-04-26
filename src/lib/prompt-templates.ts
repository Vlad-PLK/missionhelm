import { queryOne } from '@/lib/db';
import type { Task, Agent, Workspace } from '@/lib/types';
import { getMissionControlUrl, getProjectsPath } from '@/lib/config';
import { isCodingTask } from './opencode';
import { APP_DISPLAY_NAME } from './branding';

export interface DispatchContext {
  task: Task;
  agent: Agent;
  workspace: Workspace | null;
  blockingTasks: Array<{ id: string; title: string; status: string }>;
  dependentTasks: Array<{ id: string; title: string; status: string }>;
  planningSpec: { success_criteria?: string[]; deliverables?: string[] } | null;
  missionControlUrl: string;
  planningAgents?: Array<{ agent_id?: string; name?: string; instructions?: string }>;
}

const PRIORITY_EMOJI: Record<string, string> = {
  low: '🔵',
  normal: '⚪',
  high: '🟡',
  urgent: '🔴'
};

function resolveTilde(input: string): string {
  if (!input) return input;
  if (!input.startsWith('~')) return input;
  return input.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '');
}

function shellQuote(input: string): string {
  return `'${input.replace(/'/g, `'\\''`)}'`;
}

function promptDelimiter(taskId: string, suffix: string): string {
  return `MC_${suffix}_${taskId.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

type CodingExecutor = 'codex' | 'opencode';

function resolveCodingExecutor(): CodingExecutor {
  const raw = (process.env.MC_CODING_EXECUTOR || 'codex').trim().toLowerCase();
  return raw === 'opencode' ? 'opencode' : 'codex';
}

export function buildDispatchPrompt(context: DispatchContext): string {
  const { task, agent, workspace, blockingTasks, dependentTasks, planningSpec, missionControlUrl, planningAgents } = context;
  const priorityEmoji = PRIORITY_EMOJI[task.priority] || '⚪';
  const codebaseDir = workspace?.folder_path ? resolveTilde(workspace.folder_path.trim()) : null;
  const quotedCodebaseDir = codebaseDir ? shellQuote(codebaseDir) : null;
  
  const projectsBaseDir = resolveTilde(getProjectsPath());
  const projectDir = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const taskWorkingDir = codebaseDir || `${projectsBaseDir}/${projectDir}`;
  const deliverableExamplePath = codebaseDir 
    ? `${codebaseDir}/path/inside/repo.ext` 
    : `${taskWorkingDir}/filename.html`;

  const parts: string[] = [];

  parts.push(`${priorityEmoji} **NEW TASK ASSIGNED`);
  parts.push('');
  parts.push('**CONTEXT:**');
  parts.push(`- Workspace: ${workspace?.name || 'Unknown'} ${workspace?.folder_path ? `(${workspace.folder_path})` : ''}`);
  parts.push(`- Agent: ${agent.name} (${agent.role || 'Team Member'})`);
  parts.push(`- Task ID: ${task.id}`);
  parts.push('');

  parts.push('**TASK:**');
  parts.push(`**Title:** ${task.title}`);
  if (task.description) {
    parts.push(`**Description:** ${task.description}`);
  }
  parts.push(`**Priority:** ${task.priority.toUpperCase()}`);
  if (task.due_date) {
    const dueDate = new Date(task.due_date);
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const urgency = daysUntilDue <= 1 ? '🔴 URGENT' : daysUntilDue <= 3 ? '🟡 Soon' : '';
    parts.push(`**Due:** ${task.due_date}${urgency ? ` ${urgency}` : ''}`);
  }
  parts.push('');

  if (blockingTasks.length > 0) {
    parts.push('**BLOCKING TASKS (must complete first):**');
    for (const bt of blockingTasks) {
      parts.push(`- [${bt.status.toUpperCase()}] ${bt.title} (${bt.id.slice(0, 8)})`);
    }
    parts.push('');
  }

  if (dependentTasks.length > 0) {
    parts.push('**DEPENDENT TASKS (waiting on this):**');
    for (const dt of dependentTasks) {
      parts.push(`- [${dt.status.toUpperCase()}] ${dt.title} (${dt.id.slice(0, 8)})`);
    }
    parts.push('');
  }

  if (planningSpec) {
    if (planningSpec.success_criteria && planningSpec.success_criteria.length > 0) {
      parts.push('**SUCCESS CRITERIA:**');
      for (const criterion of planningSpec.success_criteria) {
        parts.push(`- ${criterion}`);
      }
      parts.push('');
    }
    if (planningSpec.deliverables && planningSpec.deliverables.length > 0) {
      parts.push('**EXPECTED DELIVERABLES:**');
      for (const del of planningSpec.deliverables) {
        parts.push(`- ${del}`);
      }
      parts.push('');
    }
  }

  if (planningAgents && planningAgents.length > 0) {
    const myInstructions = planningAgents.find(
      (a) => a.agent_id === agent.id || a.name === agent.name
    );
    if (myInstructions?.instructions) {
      parts.push('**🎯 YOUR INSTRUCTIONS:**');
      parts.push(myInstructions.instructions);
      parts.push('');
    } else {
      const allInstructions = planningAgents
        .filter((a) => a.instructions)
        .map((a) => `- **${a.name || 'Agent'}:** ${a.instructions}`)
        .join('\n');
      if (allInstructions) {
        parts.push('**🎯 AGENT INSTRUCTIONS:**');
        parts.push(allInstructions);
        parts.push('');
      }
    }
  }

  parts.push('**OUTPUT DIRECTORY:**');
  if (codebaseDir) {
    parts.push(`${codebaseDir}`);
    parts.push('Work directly inside this directory. Do NOT create a new subfolder for this task.');
  } else {
    parts.push(`${taskWorkingDir}`);
    parts.push('Create this directory and save all deliverables there.');
  }
  parts.push('');

  parts.push('**AGENT CAPABILITIES:**');
  parts.push(`- Role: ${agent.role || 'General assistant'}`);
  if (agent.soul_md) {
    const soulPreview = agent.soul_md.slice(0, 200);
    parts.push(`- Personality: ${soulPreview}${agent.soul_md.length > 200 ? '...' : ''}`);
  }
  parts.push('');

  const isCoding = isCodingTask(task.title, task.description || '');
  const codingExecutor = resolveCodingExecutor();
  const codexModel = (process.env.MC_CODEX_MODEL || 'gpt-5.4').trim();
  const codexBinary = '/home/vlad-plk/.npm-global/bin/codex';
  const opencodeModel = (process.env.OPENCODE_CODING_MODEL || 'openai/gpt-5.3').trim();
  const opencodeFallbackModel = (process.env.OPENCODE_CODING_FALLBACK_MODEL || '').trim();
  const opencodeBinary = '/home/vlad-plk/.npm-global/bin/opencode';
  const executorDelimiter = promptDelimiter(task.id, 'EXECUTOR_PROMPT');

  if (isCoding && codebaseDir) {
    parts.push(`**🤖 CODING EXECUTION (${codingExecutor.toUpperCase()} PREFERRED):**`);
    parts.push(`This is a coding task. Execute via ${codingExecutor === 'codex' ? 'Codex CLI single-pass mode' : 'OpenCode CLI'} and then report back through ${APP_DISPLAY_NAME} task APIs.`);
    parts.push('**Execution authorization:** You are pre-authorized to run shell/exec commands for coding execution and task API updates.');
    parts.push('');

    if (codingExecutor === 'codex') {
      parts.push(`**Executor:** Codex CLI (${codexModel})`);
      parts.push('Use single-pass Codex execution (no PLAN/BUILD split).');
      parts.push('OpenClaw session reasoning target: high.');
      parts.push('Pass the task directly to Codex with JSON output.');
      parts.push('```bash');
      parts.push(`cd ${quotedCodebaseDir} && ${codexBinary} exec --model ${codexModel} --json "$(cat <<'${executorDelimiter}'`);
      parts.push(`Task ID: ${task.id}`);
      parts.push(`Task: ${task.title}`);
      if (task.description) {
        parts.push(`Description: ${task.description}`);
      }
      if (planningSpec?.success_criteria?.length) {
        parts.push('Success criteria:');
        planningSpec.success_criteria.forEach((criterion) => parts.push(`- ${criterion}`));
      }
      if (planningSpec?.deliverables?.length) {
        parts.push('Expected deliverables:');
        planningSpec.deliverables.forEach((deliverable) => parts.push(`- ${deliverable}`));
      }
      parts.push('Requirements:');
      parts.push('- Make only the required code/file updates in this repository.');
      parts.push('- Prefer minimal, targeted changes.');
      parts.push('- Do not start servers or long-running processes.');
      parts.push('- Return concise summary of changed files and why.');
      parts.push(executorDelimiter);
      parts.push(')"');
      parts.push('```');
      parts.push('If execution fails, fix minimally and retry once.');
    } else {
      parts.push(`**Executor:** OpenCode CLI (${opencodeModel})`);
      if (opencodeFallbackModel) {
        parts.push(`Fallback model: ${opencodeFallbackModel}`);
      }
      parts.push('Before running OpenCode, run a mandatory preflight exec call as your first assistant event:');
      parts.push('```bash');
      parts.push(`cd ${quotedCodebaseDir} && pwd && echo EXEC_PREFLIGHT_OK`);
      parts.push('```');
      parts.push('If preflight fails, immediately report `BLOCKED:` with exact stderr and missing dependency.');
      parts.push('```bash');
      parts.push(`cd ${quotedCodebaseDir} && ${opencodeBinary} run -m ${opencodeModel} "$(cat <<'${executorDelimiter}'`);
      parts.push(`Task: ${task.title}`);
      if (task.description) {
        parts.push(`Description: ${task.description}`);
      }
      if (planningSpec?.success_criteria?.length) {
        parts.push('Success criteria:');
        planningSpec.success_criteria.forEach((criterion) => parts.push(`- ${criterion}`));
      }
      parts.push('Requirements:');
      parts.push('- Make the required code/file updates in the current repository.');
      parts.push('- Prefer minimal, targeted changes.');
      parts.push('- Do not start servers or long-running processes.');
      parts.push('- Return concise summary of changed files and why.');
      parts.push(executorDelimiter);
      parts.push(')"');
      parts.push('```');
      if (opencodeFallbackModel) {
        parts.push(`If ${opencodeModel} fails with quota/billing/entitlement error, retry once with ${opencodeFallbackModel}.`);
      }
    }

    parts.push('');
  } else if (isCoding && !codebaseDir) {
    parts.push('**⚠️ BLOCKER — CODING TASK MISSING WORKSPACE FOLDER:**');
    parts.push('This task cannot run safely until workspace.folder_path is configured to the real repository path.');
    parts.push('Report blocker to orchestrator instead of executing in a synthetic directory.');
    parts.push('');
  }

  parts.push('**IMPORTANT - COMPLETION PROTOCOL:**');
  parts.push('After receiving this dispatch, you MUST follow this exact reporting sequence:');
  parts.push('');
  parts.push('0. **First-turn execution contract (mandatory, strict):**');
  parts.push('   - Your first assistant event MUST be a real tool call (prefer `exec`) that advances the task.');
  parts.push('   - Do NOT output standalone ACK/progress text before that first tool call.');
  parts.push('   - After a successful tool result, immediately emit exactly:');
  parts.push('     `ACK_TASK: <brief restatement> | next: <first step>`');
  parts.push('     `EXEC_STARTED: <exact command or action run>`');
  parts.push('   - If you cannot execute any tool call immediately, emit: `BLOCKED: <exact reason> | need: <specific fix> | meanwhile: <fallback>`');
  parts.push('   - Any `ACK_TASK`/`EXEC_STARTED` without a preceding successful tool result is invalid and treated as protocol violation.');
  parts.push('');
  parts.push('1. **Log activity:**');
  parts.push(`   POST ${missionControlUrl}/api/tasks/${task.id}/activities`);
  parts.push('   Body: {"activity_type": "completed", "message": "Description of what was done"}');
  parts.push('');
  parts.push('2. **Register deliverables:**');
  parts.push(`   POST ${missionControlUrl}/api/tasks/${task.id}/deliverables`);
  parts.push(`   Body: {"deliverable_type": "file", "title": "File name", "path": "${deliverableExamplePath}"}`);
  parts.push('');
  parts.push('3. **Update status:**');
  parts.push(`   PATCH ${missionControlUrl}/api/tasks/${task.id}`);
  parts.push('   Body: {"status": "review"}');
  parts.push('');

  parts.push('**ERROR HANDLING:**');
  parts.push('If APIs fail:');
  parts.push('- Retry up to 3 times with exponential backoff (1s, 2s, 4s)');
  parts.push('- If persistent failure, log activity with error details using POST /activities');
  parts.push('- Continue with work but document the failure in your response');
  parts.push('- Do NOT abandon the task due to API errors');
  parts.push('');
  parts.push('If blocked or stuck:');
  parts.push('- Log your current progress with POST /activities');
  parts.push('- Request help from the orchestrator');
  parts.push('- Provide specific questions, not just "help me"');
  parts.push('');

  parts.push('When complete, reply with:');
  parts.push('`TASK_COMPLETE: [brief summary of what you did]`');
  parts.push('');
  parts.push('While working, report progress with:');
  parts.push('`PROGRESS_UPDATE: [what changed] | next: [next step] | eta: [time]`');
  parts.push('');
  parts.push('If blocked, report:');
  parts.push('`BLOCKED: [blocker] | need: [specific input] | meanwhile: [fallback work]`');
  parts.push('');
  parts.push('If you need help or clarification, ask the orchestrator with specific questions.');

  return parts.join('\n');
}

export function fetchDispatchContext(taskId: string): DispatchContext | null {
  const missionControlUrl = getMissionControlUrl();

  const task = queryOne<Task>(
    'SELECT * FROM tasks WHERE id = ?',
    [taskId]
  );

  if (!task) return null;

  const agent = task.assigned_agent_id 
    ? queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [task.assigned_agent_id])
    : null;

  const workspace = task.workspace_id
    ? queryOne<Workspace>('SELECT * FROM workspaces WHERE id = ?', [task.workspace_id])
    : null;

  const blockingTasks: Array<{ id: string; title: string; status: string }> = [];

  const dependentTasks: Array<{ id: string; title: string; status: string }> = [];

  let planningSpec: { success_criteria?: string[]; deliverables?: string[] } | null = null;
  if (task.planning_spec) {
    try {
      planningSpec = JSON.parse(task.planning_spec);
    } catch {
      planningSpec = null;
    }
  }

  let planningAgents: Array<{ agent_id?: string; name?: string; instructions?: string }> = [];
  if (task.planning_agents) {
    try {
      planningAgents = JSON.parse(task.planning_agents);
    } catch {
      planningAgents = [];
    }
  }

  if (!agent) return null;

  return {
    task,
    agent,
    workspace: workspace || null,
    blockingTasks,
    dependentTasks,
    planningSpec,
    missionControlUrl,
    planningAgents
  };
}
