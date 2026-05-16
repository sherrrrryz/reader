"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SearchBar } from "./SearchBar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Info, LogOut } from "lucide-react";

const TABS = [
  { href: "/documents", label: "Documents" },
  { href: "/vocabulary", label: "Vocabulary" },
  { href: "/writing", label: "Writing" },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const active = TABS.find((t) => pathname.startsWith(t.href))?.href ?? TABS[0].href;

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
        <Tabs value={active}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.href} value={t.href} asChild>
                <Link href={t.href}>{t.label}</Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2">
          <SearchBar />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild aria-label="About">
                <Link href="/about">
                  <Info className="size-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>About</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
                <LogOut className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
