'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, Settings2, ShieldCheck, Sparkles, Users, Workflow } from 'lucide-react';

interface WorkspaceQuickActionsProps {
  workspaceSlug: string;
}

export function WorkspaceQuickActions({ workspaceSlug }: WorkspaceQuickActionsProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const links = [
    { href: `/workspace/${workspaceSlug}`, label: 'Open queue', icon: Sparkles },
    { href: `/workspace/${workspaceSlug}/review`, label: 'Review surface', icon: ShieldCheck },
    { href: `/workspace/${workspaceSlug}/planning`, label: 'Planning', icon: Workflow },
    { href: `/workspace/${workspaceSlug}/agents`, label: 'Agents', icon: Users },
    { href: `/workspace/${workspaceSlug}/settings`, label: 'Settings', icon: Settings2 },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full border border-mc-border bg-mc-bg/90 text-mc-text-secondary transition-all duration-300 hover:border-mc-accent/40 hover:text-mc-text active:scale-[0.98]"
        aria-label="Open workspace quick actions"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-52 rounded-2xl border border-white/10 bg-mc-bg-secondary/95 p-2 shadow-[0_20px_40px_-22px_rgba(0,0,0,0.65)] backdrop-blur-xl [box-shadow:0_20px_40px_-22px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.08)]"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-mc-text-secondary transition-all duration-300 hover:bg-mc-bg hover:text-mc-text"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
