"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, BellRing, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/profile", label: "Research Profile", icon: User },
  { href: "/settings/alerts", label: "Alerts", icon: BellRing },
  { href: "/settings/searches", label: "Saved Searches", icon: Search },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Settings size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tighter text-foreground">Settings</h1>
          <p className="text-[13px] text-muted-foreground">Manage your research profile and preferences</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/50 p-1 w-fit">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-all duration-150",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon size={14} />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Page content */}
      <div>{children}</div>
    </div>
  );
}
