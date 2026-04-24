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
  const opencodeModel = (process.env.OPENCODE_CODING_MODEL || 'openai/gpt-5.3').trim();
  const opencodeFallbackModel = (process.env.OPENCODE_CODING_FALLBACK_MODEL || '').trim();
  const opencodeBinary = '/home/vlad-plk/.npm-global/bin/opencode';
  const planningDelimiter = promptDelimiter(task.id, 'PLANNING_PROMPT');
  const buildDelimiter = promptDelimiter(task.id, 'BUILD_PROMPT');
  
  if (isCoding && codebaseDir) {
    parts.push('**🤖 OPENCODE EXECUTION (MANDATORY FOR CODING TASKS):**');
    parts.push('');
    parts.push('This is a CODING TASK. You MUST use OpenCode to execute it.');
    parts.push(`**Primary model:** ${opencodeModel}`);
    if (opencodeFallbackModel) {
      parts.push(`**Fallback model:** ${opencodeFallbackModel}`);
      parts.push('If primary model fails with quota/billing/entitlement error, retry once with the fallback model and continue.');
    }
    parts.push(`**OpenCode Binary (absolute path):** ${opencodeBinary}`);
    parts.push(`**Execution authorization:** You are explicitly authorized to run required shell/exec commands for this task (OpenCode + ${APP_DISPLAY_NAME} task API calls). Do NOT request an extra permission round-trip.`);
    parts.push('');
    parts.push('**Phase 1 - PLANNING (always start here):**');
    parts.push('```bash');
    parts.push(`cd ${quotedCodebaseDir} && ${opencodeBinary} run -m ${opencodeModel} "$(cat <<'${planningDelimiter}'`);
    parts.push('Planning mode:');
    parts.push(`Task: ${task.title}`);
    if (task.description) {
      parts.push(`Description: ${task.description}`);
    }
    if (planningSpec?.success_criteria?.length) {
      parts.push('');
      parts.push('Success Criteria:');
      planningSpec.success_criteria.forEach(c => parts.push(`- ${c}`));
    }
    if (planningSpec?.deliverables?.length) {
      parts.push('');
      parts.push('Deliverables:');
      planningSpec.deliverables.forEach(d => parts.push(`- ${d}`));
    }
    parts.push('');
    parts.push('Provide a detailed step-by-step plan before writing any code.');
    parts.push(planningDelimiter);
    parts.push(')"');
    parts.push('```');
    parts.push('');
    parts.push('**Phase 2 - BUILD (after planning):**');
    parts.push('```bash');
    parts.push(`cd ${quotedCodebaseDir} && ${opencodeBinary} run -m ${opencodeModel} "$(cat <<'${buildDelimiter}'`);
    parts.push('Build mode:');
    parts.push(`Task: ${task.title}`);
    if (task.description) {
      parts.push(`Description: ${task.description}`);
    }
    parts.push('');
    parts.push('Work in the current directory. Make actual code changes. Do NOT run or test the code.');
    parts.push(buildDelimiter);
    parts.push(')"');
    parts.push('```');
    parts.push('');
    parts.push('**🚫 STRICTLY PROHIBITED - NEVER DO THESE:**');
    parts.push('❌ DO NOT run `npm run dev`, `npm start`, `npm run build` or any server');
    parts.push('❌ DO NOT execute the code (no `node`, `python`, `cargo run`, etc.)');
    parts.push('❌ DO NOT deploy or push to production');
    parts.push('❌ DO NOT run test suites unless explicitly requested in the task');
    parts.push('❌ DO NOT install packages or run `npm install`');
    parts.push('❌ DO NOT start development servers or containers');
    parts.push('');
    parts.push('Your job is ONLY to write code, not to test or run it.');
    parts.push('');
    parts.push('**⚠️ IMPORTANT WARNINGS:**');
    parts.push('⚠️ ALWAYS run planning phase first - do NOT skip to building');
    parts.push('⚠️ Always `cd` into the target directory before running OpenCode');
    parts.push('⚠️ Make actual file changes using write/edit tools');
    parts.push('⚠️ NEVER test or run the code - only write it');
    parts.push('');
    parts.push('**ERROR HANDLING:**');
    parts.push('If OpenCode fails:');
    if (opencodeFallbackModel) {
      parts.push(`- If the error is quota/billing/entitlement on ${opencodeModel}, retry once with ${opencodeFallbackModel}`);
    }
    parts.push('- Report FAILURE IMMEDIATELY to the orchestrator');
    parts.push('- Do NOT attempt to do the work yourself as fallback');
    parts.push('- OpenCode is the ONLY way to complete coding tasks');
    parts.push('- Provide the exact error message in your report');
    parts.push('');
    parts.push('**CAPTURING RESULTS:**');
    parts.push('After OpenCode completes:');
    parts.push('1. Capture the final OpenCode output (summary of changes)');
    parts.push('2. Log activity with the output summary');
    parts.push('3. The actual code changes in the workspace are the real deliverables');
    parts.push('');
  } else if (isCoding && !codebaseDir) {
    parts.push('**⚠️ CODING TASK WITHOUT WORKSPACE FOLDER:**');
    parts.push('This is a coding task but no workspace folder is configured.');
    parts.push('Please inform the orchestrator that a workspace folder is required.');
    parts.push('');
  }

  parts.push('**IMPORTANT - COMPLETION PROTOCOL:**');
  parts.push('After completing work, you MUST follow this exact sequence:');
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
