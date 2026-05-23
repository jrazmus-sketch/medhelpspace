"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings, User, Shield, Sun, Moon, Monitor, Search, Calendar } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useTheme } from "@/components/theme/theme-provider";
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
import {
  STUDY_TYPE_CONFIG,
  getStudyTypeFromPathname,
  type StudyTypeKey,
} from "@/lib/page-type";

type PersonalLink = { href: string; label: string; exact?: boolean; highlight?: boolean };

const PERSONAL_LINKS: PersonalLink[] = [
  { href: "/app",       label: "Início",    exact: true     },
  { href: "/app/plano", label: "Meu Plano", highlight: true },
];

// `typeKey` drives the in-section accent color (matches TypeChip vocab).
// `matchTypes` defaults to [typeKey]; Questões accepts both quiz + simulados
// because simulados live under the same hub.
type ContentLink = {
  href: string;
  label: string;
  typeKey: StudyTypeKey;
  matchTypes?: StudyTypeKey[];
};

// Content links grouped by study modality — practice, read, listen.
// Groups are separated visually by a slightly wider gap; no inline labels.
const CONTENT_GROUPS: ContentLink[][] = [
  // practice (active recall)
  [
    { href: "/app/estudo-por-questoes", label: "Questões",   typeKey: "quiz", matchTypes: ["quiz", "simulados"] },
    { href: "/app/flashcards",          label: "Flashcards", typeKey: "flashcards" },
  ],
  // read (narrative / visual)
  [
    { href: "/app/resumos",         label: "Resumos", typeKey: "resumos" },
    { href: "/app/formula-medhelp", label: "Fórmula", typeKey: "formula" },
  ],
  // listen (audio)
  [
    { href: "/app/medvoice",   label: "MedVoice",   typeKey: "medvoice" },
    { href: "/app/audiocards", label: "AudioCards", typeKey: "audiocards" },
  ],
];

function renderPersonalLink(link: PersonalLink, pathname: string) {
  const { href, label, exact, highlight } = link;
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      key={href}
      href={href}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13.5px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : highlight
            ? "text-brand hover:bg-brand/10"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {highlight && <Calendar className="h-3.5 w-3.5" />}
      {label}
    </Link>
  );
}

function renderContentLink(
  link: ContentLink,
  pathname: string,
  currentType: StudyTypeKey | null,
) {
  const { href, label, typeKey } = link;
  const matchTypes = link.matchTypes ?? [typeKey];
  const isRoot = pathname === href;
  const isInSection = !isRoot && currentType != null && matchTypes.includes(currentType);
  return (
    <Link
      key={href}
      href={href}
      aria-current={isRoot ? "page" : isInSection ? "true" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13.5px] transition-colors",
        isRoot
          ? "bg-foreground text-background font-medium"
          : isInSection
            ? "font-semibold hover:bg-accent"
            : "font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      style={isInSection ? { color: STUDY_TYPE_CONFIG[typeKey].color } : undefined}
    >
      {label}
    </Link>
  );
}

export function MemberHeader({ bellSlot }: { bellSlot?: React.ReactNode } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, isAnyAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const currentType = getStudyTypeFromPathname(pathname);

  async function handleTheme(value: "light" | "dark" | "system") {
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
    <header className="border-b border-border/40 bg-background/90 backdrop-blur-md">
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
        <nav className="hidden items-center md:flex">
          {/* Personal cluster (Início, Meu Plano) */}
          <div className="flex items-center gap-0.5">
            {PERSONAL_LINKS.map((link) => renderPersonalLink(link, pathname))}
          </div>

          {/* Divider between personal and content */}
          <span aria-hidden="true" className="mx-3 h-5 w-px bg-border" />

          {/* Content cluster — modality groups separated by wider gap */}
          {CONTENT_GROUPS.map((group, idx) => (
            <div
              key={idx}
              className={cn("flex items-center gap-0.5", idx > 0 && "ml-3")}
            >
              {group.map((link) => renderContentLink(link, pathname, currentType))}
            </div>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/app/buscar"
            aria-label="Buscar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Search className="h-4 w-4" />
          </Link>

          {bellSlot}

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
                <DropdownMenuItem onClick={() => router.push("/app/plano")}>
                  <Calendar className="mr-2 h-4 w-4" />
                  Meu Plano de Estudos
                </DropdownMenuItem>
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
