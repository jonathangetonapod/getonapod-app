import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { DocsSearch } from "@/components/docs/DocsSearch";
import { EndpointCard } from "@/components/docs/EndpointCard";
import { API_CATEGORIES, getAllEndpoints, searchEndpoints } from "@/lib/api-docs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Menu } from "lucide-react";

const Docs = () => {
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const allEndpoints = useMemo(() => getAllEndpoints(), []);

  const filteredCategories = useMemo(() => {
    if (!search) return API_CATEGORIES;
    const matched = searchEndpoints(search);
    const matchedIds = new Set(matched.map((e) => e.id));
    return API_CATEGORIES.map((cat) => ({
      ...cat,
      endpoints: cat.endpoints.filter((e) => matchedIds.has(e.id)),
    })).filter((cat) => cat.endpoints.length > 0);
  }, [search]);

  // Scroll to hash on mount
  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (hash) {
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [location.hash]);

  // IntersectionObserver for active section tracking
  useEffect(() => {
    const ids = [
      ...API_CATEGORIES.map((c) => c.id),
      ...allEndpoints.map((e) => e.id),
    ];

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 }
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [allEndpoints]);

  const sidebarContent = (
    <DocsSidebar categories={API_CATEGORIES} activeId={activeId} />
  );

  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-28 pb-12 px-4">
        <div className="container mx-auto max-w-7xl text-center">
          <Badge variant="secondary" className="mb-4">
            {allEndpoints.length} Endpoints
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            API Documentation
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Complete reference for the Get On A Pod Supabase Edge Functions API.
            Manage clients, generate AI content, discover podcasts, and more.
          </p>
          <div className="max-w-md mx-auto">
            <DocsSearch value={search} onChange={setSearch} />
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="pb-20 px-4">
        <div className="container mx-auto max-w-7xl">
          <div className="flex gap-8">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:block w-64 shrink-0">
              <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-4">
                {sidebarContent}
              </div>
            </aside>

            {/* Mobile Sidebar */}
            <div className="lg:hidden fixed bottom-4 right-4 z-40">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button size="icon" className="h-12 w-12 rounded-full shadow-lg">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 pt-12 overflow-y-auto">
                  <div onClick={() => setMobileOpen(false)}>
                    {sidebarContent}
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Main Content */}
            <div className="flex-1 min-w-0 space-y-12">
              {filteredCategories.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  No endpoints match "{search}"
                </div>
              )}

              {filteredCategories.map((category) => (
                <div key={category.id} id={category.id} className="scroll-mt-24">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold">{category.name}</h2>
                    <p className="text-muted-foreground mt-1">{category.description}</p>
                  </div>
                  <div className="space-y-6">
                    {category.endpoints.map((endpoint) => (
                      <EndpointCard key={endpoint.id} endpoint={endpoint} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default Docs;
