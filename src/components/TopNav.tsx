"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SearchBar } from "./SearchBar";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const tabs = [
    { href: "/documents", label: "Documents" },
    { href: "/vocabulary", label: "Vocabulary" },
  ];

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <div className="flex items-center gap-2 font-semibold">📖 Reader</div>
        <nav className="flex items-center gap-1">
          {tabs.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SearchBar />
          <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
