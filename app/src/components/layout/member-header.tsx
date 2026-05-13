"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings, User, Shield, Sun, Moon, Monitor } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

const NAV_LINKS = [
  { href: "/app",              label: "Início",     exact: true },
  { href: "/app/simulados",    label: "Questões"                },
  { href: "/app/resumos",      label: "Resumos"                 },
  { href: "/app/medvoice",     label: "MedVoice"                },
  { href: "/app/formula-medhelp", label: "Fórmula"             },
  { href: "/app/audiocards",   label: "AudioCards"              },
];

export function MemberHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, isAnyAdmin } = useAuth();
  const { theme, setTheme } = useTheme();

  async function handleTheme(value: string) {
    setTheme(value);
    if (!USE_MOCK_DATA && profile) {
      const supabase = createClient();
      await supabase.from("profiles").update({ theme_preference: value }).eq("id", profile.id);
    }
  }

  const displayName = profile?.display_name ?? profile?.email ?? "M";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  function handleSignOut() {
    router.push("/auth/signout");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-[52px] max-w-[1400px] items-center gap-3 px-[10px] md:px-8">

        {/* Logo */}
        <Link href="/app" className="mr-3 flex items-center gap-2.5 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-brand text-brand-fg text-[13px] font-bold tracking-tight">
            M
          </div>
          <span className="text-[15px] font-semibold tracking-tight">
            MedHelp <span className="text-muted-foreground font-normal">· Space</span>
          </span>
        </Link>

        {/* Nav */}
        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV_LINKS.map(({ href, label, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[13.5px] font-medium transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger
              className="h-8 w-8 rounded-[5px] outline-none"
              aria-label="Menu do usuário"
            >
              <Avatar className="h-8 w-8 rounded-[5px] border border-brand/20">
                <AvatarFallback className="rounded-[5px] bg-brand text-brand-fg text-[13px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-52" align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{profile?.display_name ?? "Usuário"}</span>
                    <span className="text-xs font-normal text-muted-foreground">{profile?.email}</span>
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => router.push("/app/perfil")}>
                  <User className="mr-2 h-4 w-4" />
                  Meu perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/app/configuracoes")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </DropdownMenuItem>
              </DropdownMenuGroup>

              {isAnyAdmin() && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push("/admin")}>
                    <Shield className="mr-2 h-4 w-4" />
                    Painel admin
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Tema</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleTheme("light")} className={theme === "light" ? "text-brand" : ""}>
                  <Sun className="mr-2 h-4 w-4" />
                  Claro
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleTheme("dark")} className={theme === "dark" ? "text-brand" : ""}>
                  <Moon className="mr-2 h-4 w-4" />
                  Escuro
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleTheme("system")} className={theme === "system" ? "text-brand" : ""}>
                  <Monitor className="mr-2 h-4 w-4" />
                  Sistema
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
