import { cn } from "@/lib/utils";
import { type ApiCategory } from "@/lib/api-docs";

interface DocsSidebarProps {
  categories: ApiCategory[];
  activeId: string;
}

export function DocsSidebar({ categories, activeId }: DocsSidebarProps) {
  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      window.history.replaceState(null, "", `#${id}`);
    }
  };

  return (
    <nav className="space-y-4">
      <button
        onClick={() => handleClick("rate-limits")}
        className={cn(
          "text-sm font-semibold w-full text-left px-3 py-1.5 rounded-md transition-colors",
          activeId === "rate-limits"
            ? "text-foreground bg-muted"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Rate Limits & Performance
      </button>
      {categories.map((category) => (
        <div key={category.id}>
          <button
            onClick={() => handleClick(category.id)}
            className={cn(
              "text-sm font-semibold w-full text-left px-3 py-1.5 rounded-md transition-colors",
              activeId === category.id
                ? "text-foreground bg-muted"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {category.name}
          </button>
          <ul className="mt-1 ml-3 space-y-0.5">
            {category.endpoints.map((endpoint) => (
              <li key={endpoint.id}>
                <button
                  onClick={() => handleClick(endpoint.id)}
                  className={cn(
                    "text-sm w-full text-left px-3 py-1 rounded-md transition-colors truncate block",
                    activeId === endpoint.id
                      ? "text-foreground bg-muted/80"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {endpoint.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
