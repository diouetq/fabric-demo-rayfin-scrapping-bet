import type { ReactNode } from "react";
import {
    ArrowRight,
    BarChart3,
    Database,
    ExternalLink,
    Linkedin,
    Loader2,
    Mail,
    Sparkles,
    Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/auth.context";

const CONTACT_EMAIL = "diouet.pro@gmail.com";
const LINKEDIN_URL = "https://www.linkedin.com/in/quentin-diouet/";
const PORTFOLIO_URL = "https://diouetq.github.io/portfolio/";

function buildFabricPortalAppUrl(): string | null {
    const portal = import.meta.env.VITE_FABRIC_PORTAL_URL?.replace(/\/$/, "");
    const workspaceId = import.meta.env.VITE_FABRIC_WORKSPACE_ID;
    const itemId = import.meta.env.VITE_FABRIC_ITEM_ID;
    if (!portal || !workspaceId || !itemId) return null;
    return `${portal}/groups/${workspaceId}/appbackends/${itemId}?experience=power-bi`;
}

const MODULES = [
    {
        icon: Zap,
        label: "Cotes en direct",
        desc: "Récupérez les cotes Betify, MyStake, Sportaza",
        bullets: ["TRJ & value bets", "Kelly & surebets", "Compétitions à venir"],
    },
    {
        icon: Database,
        label: "Mes paris",
        desc: "Centralisez tous vos paris en un seul endroit",
        bullets: ["Saisie manuelle ou depuis les cotes collectées", "Édition inline", "Historique complet"],
    },
    {
        icon: BarChart3,
        label: "KPI",
        desc: "Visualisez votre performance en direct",
        bullets: ["ROI & bankroll", "Analyses par bookmaker", "Filtres par période"],
    },
] as const;

const STEPS = [
    { n: 1, title: "Demander l'accès", body: "Cliquez le bouton ci-dessous avec votre adresse email." },
    { n: 2, title: "Recevoir l'invitation", body: "Vous serez ajouté au workspace Fabric de l'application." },
    { n: 3, title: "Accepter l'invitation", body: "Validez le lien reçu par email avant toute connexion." },
    { n: 4, title: "Ouvrir l'application", body: "Connectez-vous via le bouton principal une fois invité." },
] as const;

function BrandLogo() {
    return (
        <div className="relative h-16 w-16 shrink-0 rounded-2xl bg-white/15 backdrop-blur-md ring-1 ring-white/25 shadow-xl">
            <svg viewBox="0 0 32 32" className="absolute inset-0 m-auto h-8 w-8 text-white" fill="none" aria-hidden>
                <path d="M16 4L26 10v12L16 28 6 22V10L16 4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M16 10v12M11 13l5-3 5 3M11 19l5 3 5-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        </div>
    );
}

export function AuthGate({ children }: { children: ReactNode }) {
    const { isLoading, isAuthenticated, isSigningIn, error, signIn } = useAuth();
    const fabricPortalAppUrl = buildFabricPortalAppUrl();
    const mailtoAccess = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Demande d'accès — démo Paris Sportif - Value Bet (Fabric App / Rayfin)")}&body=${encodeURIComponent(
        [
            "Bonjour Quentin,",
            "",
            "Je souhaite accéder à la démo \"Paris Sportif - Value Bet\" : une Fabric App développée avec Rayfin,",
            "qui teste Microsoft Fabric (Preview) sur un cas d'usage réel de value betting",
            "(scan des cotes, calculs Kelly/TRJ/surebet, suivi des paris).",
            "",
            "Merci de m'ajouter au workspace Fabric avec l'adresse suivante (idéalement un compte Microsoft/Entra) :",
            "→ (complétez votre email ici)",
            "",
            "Nom / société (optionnel) :",
            "",
            "Une fois ajouté(e) au workspace, je recevrai une invitation Fabric par email : il me faudra l'accepter,",
            "puis je pourrai me connecter et ouvrir l'application directement depuis le bouton « Se connecter ».",
            "",
            "Merci !",
        ].join("\n"),
    )}`;

    if (isLoading) {
        return (
            <div className="gradient-brand flex min-h-screen items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="gradient-brand relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-8">
                <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
                <div
                    className="pointer-events-none absolute inset-0 opacity-[0.08]"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
                        backgroundSize: "48px 48px",
                    }}
                />

                <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-card lg:grid-cols-2">
                    {/* Colonne brand */}
                    <div className="gradient-brand relative flex flex-col p-7 text-white sm:p-9 lg:p-10">
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.14),transparent_55%)]" />

                        <div className="relative space-y-6">
                            <div className="flex items-center gap-4">
                                <BrandLogo />
                                <div>
                                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Paris Sportif - Value Bet</h1>
                                    <p className="mt-0.5 text-sm text-white/80">Fabric App développée avec Rayfin</p>
                                </div>
                            </div>

                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest ring-1 ring-white/25">
                                <Sparkles className="h-3.5 w-3.5" />
                                Version démo
                            </span>

                            <div className="space-y-2">
                                <p className="text-base font-semibold leading-snug text-white">
                                    Une démonstration de l&apos;outil complet de value betting.
                                </p>
                                <p className="text-sm leading-relaxed text-white/85">
                                    Récupérez les cotes, repérez les values, enregistrez vos paris
                                    et suivez vos résultats — le tout dans une Fabric App construite avec Rayfin, sur Microsoft Fabric.
                                </p>
                            </div>

                            <div className="space-y-3">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                                    Ce que vous retrouverez
                                </p>
                                {MODULES.map(({ icon: Icon, label, desc, bullets }) => (
                                    <div key={label} className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
                                        <div className="flex items-center gap-2.5">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold">{label}</p>
                                                <p className="text-xs text-white/70">{desc}</p>
                                            </div>
                                        </div>
                                        <ul className="mt-2 space-y-0.5 pl-11">
                                            {bullets.map((b) => (
                                                <li key={b} className="text-[11px] text-white/75 before:mr-1.5 before:content-['·']">
                                                    {b}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Colonne action */}
                    <div className="flex flex-col p-7 sm:p-9 lg:p-10">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Première visite</p>
                        <h2 className="mt-1 text-xl font-bold text-foreground">Comment obtenir l&apos;accès ?</h2>

                        <ol className="mt-5 space-y-0">
                            {STEPS.map(({ n, title, body }, i) => (
                                <li key={n} className="relative flex gap-3 pb-4 last:pb-0">
                                    {i < STEPS.length - 1 && (
                                        <span className="absolute left-[13px] top-7 h-[calc(100%-8px)] w-px bg-border" />
                                    )}
                                    <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                                        {n}
                                    </span>
                                    <div className="min-w-0 pt-0.5">
                                        <p className="text-sm font-semibold text-foreground">{title}</p>
                                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{body}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>

                        <a
                            href={mailtoAccess}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                        >
                            <Mail className="h-4 w-4" />
                            Demander l&apos;accès
                        </a>

                        <div className="mt-4 space-y-2.5">
                            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                                <p className="text-xs font-semibold text-foreground">Déjà invité ?</p>
                                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                                    Connectez-vous avec le même email que votre invitation.
                                </p>
                            </div>

                            {fabricPortalAppUrl ? (
                                <a
                                    href={fabricPortalAppUrl}
                                    className="gradient-brand glow-ring group flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.01]"
                                >
                                    Ouvrir l&apos;application
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                </a>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void signIn()}
                                    disabled={isSigningIn}
                                    className="gradient-brand flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                                >
                                    {isSigningIn && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Se connecter
                                </button>
                            )}

                            {error && (
                                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error.message}</p>
                            )}
                        </div>

                        <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-5 text-[11px] text-muted-foreground">
                            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground hover:underline">
                                {CONTACT_EMAIL}
                            </a>
                            <span className="text-border">·</span>
                            <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                                <Linkedin className="h-3 w-3" /> LinkedIn
                            </a>
                            <span className="text-border">·</span>
                            <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                                <ExternalLink className="h-3 w-3" /> Portfolio
                            </a>
                        </footer>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
