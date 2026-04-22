'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface WorkspaceSubnavProps {
  workspaceSlug: string;
  taskId?: string;
}

const items = [
  { key: 'overview', label: 'Queue', href: (slug: string) => `/workspace/${slug}` },
  { key: 'agents', label: 'Agents', href: (slug: string) => `/workspace/${slug}/agents` },
  { key: 'planning', label: 'Planning', href: (slug: string) => `/workspace/${slug}/planning` },
  { key: 'activity', label: 'Activity', href: (slug: string) => `/workspace/${slug}/activity` },
  { key: 'review', label: 'Review', href: (slug: string) => `/workspace/${slug}/review` },
  { key: 'settings', label: 'Settings', href: (slug: string) => `/workspace/${slug}/settings` },
];

export function WorkspaceSubnav({ workspaceSlug, taskId }: WorkspaceSubnavProps) {
  const pathname = usePathname();

  return (
    <div className="border-b border-mc-border bg-mc-bg-secondary/95 backdrop-blur">
      <div className="px-4 lg:px-6 py-2 flex items-center gap-2 overflow-x-auto">
        {items.map((item) => {
          const href = item.href(workspaceSlug);
          const isActive = pathname === href || (item.key === 'overview' && taskId && pathname?.startsWith(`/workspace/${workspaceSlug}/tasks/`));

          return (
            <Link
              key={item.key}
              href={href}
              className={`px-3 py-2 rounded-full text-sm whitespace-nowrap border transition-colors ${
                isActive
                  ? 'bg-mc-accent text-mc-bg border-mc-accent'
                  : 'bg-mc-bg text-mc-text-secondary border-mc-border hover:text-mc-text hover:border-mc-accent/40'
              }`}
            >
              {item.label}
            </Link>
          );
        })}

        {taskId && pathname?.startsWith(`/workspace/${workspaceSlug}/tasks/`) && (
          <div className="px-3 py-2 rounded-full text-sm whitespace-nowrap border bg-mc-bg-tertiary text-mc-text border-mc-border">
            Task Detail
          </div>
        )}
      </div>
    </div>
  );
}
