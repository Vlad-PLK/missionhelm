import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface OpenCodeResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number | null;
  duration: number;
}

export interface OpenCodeOptions {
  workspaceDir: string;
  prompt: string;
  model?: string;
  timeout?: number;
}

const DEFAULT_TIMEOUT = 300000;

const CODING_KEYWORDS = [
  'code', 'implement', 'fix', 'bug', 'refactor', 'create', 'build',
  'add', 'update', 'modify', 'remove', 'delete', 'change', 'rewrite',
  'function', 'class', 'component', 'api', 'endpoint', 'database', 'schema',
  'file', 'script', 'test', 'feature', 'integration', 'config', 'setup',
  'deploy', 'migration', 'render', 'style', 'css', 'html', 'javascript',
  'typescript', 'react', 'next', 'node', 'python', 'api', 'backend', 'frontend'
];

export function isCodingTask(title: string, description?: string): boolean {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  const matchCount = CODING_KEYWORDS.filter(keyword => text.includes(keyword)).length;
  
  return matchCount >= 1;
}

export function detectTaskType(title: string, description?: string): 'coding' | 'research' | 'general' {
  const text = `${title} ${description || ''}`.toLowerCase();
  
  const codingKeywords = CODING_KEYWORDS;
  const researchKeywords = ['research', 'analyze', 'investigate', 'review', 'audit', 'find', 'search', 'report', 'document', 'survey'];
  const generalKeywords = ['update', 'change', 'set', 'configure', 'enable', 'disable'];
  
  const codingScore = codingKeywords.filter(k => text.includes(k)).length;
  const researchScore = researchKeywords.filter(k => text.includes(k)).length;
  
  if (codingScore > 0 && codingScore >= researchScore) {
    return 'coding';
  }
  if (researchScore > 0 && researchScore > codingScore) {
    return 'research';
  }
  
  return 'general';
}

export async function runOpenCode(options: OpenCodeOptions): Promise<OpenCodeResult> {
  const { workspaceDir, prompt, model, timeout = DEFAULT_TIMEOUT } = options;
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const args = [
      'run',
      '--dir', workspaceDir,
      '--prompt', prompt,
      '--print-logs',
      '--thinking'
    ];
    
    if (model) {
      args.push('--model', model);
    }
    
    const opencode = spawn('opencode', args, {
      cwd: workspaceDir,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    opencode.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    opencode.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    const timeoutId = setTimeout(() => {
      opencode.kill('SIGTERM');
      resolve({
        success: false,
        output: stdout,
        error: `OpenCode timed out after ${timeout / 1000} seconds`,
        exitCode: null,
        duration: Date.now() - startTime
      });
    }, timeout);
    
    opencode.on('close', (code) => {
      clearTimeout(timeoutId);
      
      if (code === 0) {
        resolve({
          success: true,
          output: stdout,
          exitCode: code,
          duration: Date.now() - startTime
        });
      } else {
        resolve({
          success: false,
          output: stdout,
          error: stderr || `OpenCode exited with code ${code}`,
          exitCode: code,
          duration: Date.now() - startTime
        });
      }
    });
    
    opencode.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        output: stdout,
        error: `Failed to spawn OpenCode: ${err.message}`,
        exitCode: null,
        duration: Date.now() - startTime
      });
    });
  });
}

export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

export async function getWorkspaceFiles(workspaceDir: string, extensions?: string[]): Promise<string[]> {
  const files: string[] = [];
  
  async function walkDir(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'build') {
          await walkDir(fullPath);
        }
      } else if (entry.isFile()) {
        if (!extensions || extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    }
  }
  
  await walkDir(workspaceDir);
  return files;
}
