import { Link, useLocation } from "wouter";
import { Fish, Map, List, Navigation, Zap, Anchor } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: Navigation },
    { href: "/rig-planner", label: "Rig Planner", icon: Anchor },
    { href: "/fish-id", label: "Scanner", icon: Zap },
    { href: "/water-map", label: "Fish Finder", icon: Map },
    { href: "/catch-log", label: "Catch Log", icon: List },
    { href: "/spots", label: "Spots", icon: Fish },
  ];

  return (
    <div className="flex flex-col md:flex-row min-h-[100dvh] bg-background">
      <nav className="md:w-64 bg-sidebar border-r border-sidebar-border flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-sidebar-border">
          <h1 className="font-serif text-xl font-bold text-sidebar-primary-foreground flex items-center gap-2">
            <Anchor className="w-5 h-5 text-sidebar-primary" />
            Tide & Tackle
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <li key={item.href}>
                  <Link href={item.href}>
                    <div
                      className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
