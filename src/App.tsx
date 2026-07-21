import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ClientPortalProvider } from "@/contexts/ClientPortalContext";
import { PlatformAdminRoute, ProtectedRoute } from "@/components/ProtectedRoute";
import { queryClient } from "@/lib/queryClient";
import { ClientProtectedRoute } from "@/components/ClientProtectedRoute";
import Index from "./pages/Index";
import Resources from "./pages/Resources";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Course from "./pages/Course";
import WhatToExpect from "./pages/WhatToExpect";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/admin/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminOnboarding from "./pages/admin/Onboarding";
import PodcastFinder from "./pages/admin/PodcastFinder";
import ProspectDashboards from "./pages/admin/ProspectDashboards";
import PodcastDatabase from "./pages/admin/PodcastDatabase";
import AuthCallback from "./pages/admin/Callback";
import CalendarDashboard from "./pages/admin/CalendarDashboard";
import UpcomingRecordings from "./pages/admin/UpcomingRecordings";
import UpcomingGoingLive from "./pages/admin/UpcomingGoingLive";
import ClientsManagement from "./pages/admin/ClientsManagement";
import ClientDetail from "./pages/admin/ClientDetail";
import OutreachPlatform from "./pages/admin/OutreachPlatform";
import GuestResourcesManagement from "./pages/admin/GuestResourcesManagement";
import LeadsManagement from "./pages/admin/LeadsManagement";
import PortalLogin from "./pages/portal/Login";
import PortalDashboard from "./pages/portal/DashboardMvp";
import PortalResources from "./pages/portal/Resources";
import ProspectView from "./pages/prospect/ProspectView";
import ClientApprovalView from "./pages/client/ClientApprovalView";
import AcceptInvite from "./pages/admin/AcceptInvite";
import WorkspaceUsers from "./pages/admin/WorkspaceUsers";
import WorkspaceClients from "./pages/app/WorkspaceClients";
import WorkspaceGuestResources from "./pages/app/WorkspaceGuestResources";
import AdminWorkspaceClients from "./pages/admin/AdminWorkspaceClients";
import AdminWorkspaceGuestResources from "./pages/admin/AdminWorkspaceGuestResources";
import ChangeInitialPassword from "./pages/account/ChangeInitialPassword";

const KeyedProspectView = () => {
  const { slug } = useParams()
  return <ProspectView key={slug || 'missing'} />
}

const KeyedClientApprovalView = () => {
  const { slug } = useParams()
  return <ClientApprovalView key={slug || 'missing'} />
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ClientPortalProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/docs" element={<Navigate to="/" replace />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/premium-placements" element={<Navigate to="/" replace />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/course" element={<Course />} />
            <Route path="/what-to-expect" element={<WhatToExpect />} />
            <Route path="/onboarding" element={<Navigate to="/admin/onboarding" replace />} />

            {/* Invite-only workspace account routes */}
            <Route path="/login" element={<AdminLogin />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/change-password" element={<ChangeInitialPassword />} />
            <Route path="/app" element={<Navigate to="/app/clients" replace />} />
            <Route
              path="/app/clients"
              element={
                <ProtectedRoute>
                  <WorkspaceClients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/guest-resources"
              element={
                <ProtectedRoute>
                  <WorkspaceGuestResources />
                </ProtectedRoute>
              }
            />

            {/* Billing is intentionally out of scope for the invite-only MVP. */}
            <Route path="/checkout" element={<Navigate to="/" replace />} />
            <Route path="/checkout/success" element={<Navigate to="/" replace />} />
            <Route path="/checkout/canceled" element={<Navigate to="/" replace />} />

            <Route path="/test-analytics" element={<Navigate to="/" replace />} />

            {/* Client Portal routes */}
            <Route path="/portal" element={<Navigate to="/portal/login" replace />} />
            <Route path="/portal/login" element={<PortalLogin />} />
            {/* Public prospect dashboard */}
            <Route path="/prospect/:slug" element={<KeyedProspectView />} />
            {/* Public client approval dashboard */}
            <Route path="/client/:slug" element={<KeyedClientApprovalView />} />
            <Route
              path="/portal/dashboard"
              element={
                <ClientProtectedRoute>
                  <PortalDashboard />
                </ClientProtectedRoute>
              }
            />
            <Route
              path="/portal/resources"
              element={
                <ClientProtectedRoute>
                  <PortalResources />
                </ClientProtectedRoute>
              }
            />

            {/* Admin routes */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/callback" element={<AuthCallback />} />

            {/* Retired admin surfaces redirect to the supported admin landing page. */}
            <Route path="/admin/ai-sales-director/*" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/videos/*" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/blog/*" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/premium-placements/*" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/customers/*" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/orders/*" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/analytics/*" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/settings/*" element={<Navigate to="/admin/dashboard" replace />} />

            <Route
              path="/admin/users"
              element={
                <PlatformAdminRoute>
                  <WorkspaceUsers />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/dashboard"
              element={
                <PlatformAdminRoute>
                  <AdminDashboard />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/onboarding"
              element={
                <PlatformAdminRoute>
                  <AdminOnboarding />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/podcast-finder"
              element={
                <PlatformAdminRoute>
                  <PodcastFinder />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/prospect-dashboards"
              element={
                <PlatformAdminRoute>
                  <ProspectDashboards />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/podcast-database"
              element={
                <PlatformAdminRoute>
                  <PodcastDatabase />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/calendar"
              element={
                <PlatformAdminRoute>
                  <CalendarDashboard />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/upcoming"
              element={
                <PlatformAdminRoute>
                  <UpcomingRecordings />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/going-live"
              element={
                <PlatformAdminRoute>
                  <UpcomingGoingLive />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/clients"
              element={
                <PlatformAdminRoute>
                  <ClientsManagement />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/clients/:id"
              element={
                <PlatformAdminRoute>
                  <ClientDetail />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/workspaces/:workspaceId/clients"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceClients />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/workspaces/:workspaceId/guest-resources"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceGuestResources />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/outreach-platform"
              element={
                <PlatformAdminRoute>
                  <OutreachPlatform />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/leads"
              element={
                <PlatformAdminRoute>
                  <LeadsManagement />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/guest-resources"
              element={
                <PlatformAdminRoute>
                  <GuestResourcesManagement />
                </PlatformAdminRoute>
              }
            />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ClientPortalProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
