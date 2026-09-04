import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, Show } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { PublicLayout } from "@/components/PublicLayout";
import { ThemeProvider } from "@/lib/theme";
import NotFound from "@/pages/not-found";

import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Explore from "@/pages/Explore";
import GymDetail from "@/pages/GymDetail";
import Classes from "@/pages/Classes";
import ClassDetail from "@/pages/ClassDetail";
import Bookings from "@/pages/Bookings";
import Memberships from "@/pages/Memberships";
import Offers from "@/pages/Offers";
import Trainers from "@/pages/Trainers";
import TrainerDetail from "@/pages/TrainerDetail";
import Wallet from "@/pages/Wallet";
import Profile from "@/pages/Profile";
import Invoices from "@/pages/Invoices";
import Orders from "@/pages/Orders";
import SignInPage from "@/pages/SignInPage";
import SignUpPage from "@/pages/SignUpPage";

import AdminLogin from "@/pages/admin/Login";
import PartnerLogin from "@/pages/partner/Login";
import PartnerDashboard from "@/pages/partner/Dashboard";
import PartnerGyms from "@/pages/partner/Gyms";
import PartnerBookings from "@/pages/partner/Bookings";
import PartnerClasses from "@/pages/partner/Classes";
import PartnerTrainers from "@/pages/partner/Trainers";
import PartnerSchedule from "@/pages/partner/Schedule";
import PartnerGxBookings from "@/pages/partner/GxBookings";
import PartnerLeads from "@/pages/partner/Leads";
import PartnerTrainerBookings from "@/pages/partner/TrainerBookings";
import PartnerPackageBookings from "@/pages/partner/PackageBookings";
import PartnerMembers from "@/pages/partner/Members";
import PartnerProducts from "@/pages/partner/PartnerProducts";
import PartnerSettings from "@/pages/partner/Settings";
import PartnerTeam from "@/pages/partner/Team";
import VendorLogin from "@/pages/vendor/Login";
import VendorDashboard from "@/pages/vendor/Dashboard";
import AgencyLogin from "@/pages/agency/Login";
import AgencyDashboard from "@/pages/agency/Dashboard";
import VendorProducts from "@/pages/vendor/Products";
import VendorOrders from "@/pages/vendor/Orders";
import VendorSettings from "@/pages/vendor/Settings";
import Blog from "@/pages/Blog";
import BlogDetail from "@/pages/BlogDetail";
import InfoPage from "@/pages/InfoPage";
import Store from "@/pages/Store";
import StoreDetail from "@/pages/StoreDetail";
import BeAMember from "@/pages/BeAMember";
import BookGxClass from "@/pages/BookGxClass";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminPartners from "@/pages/admin/Partners";
import AdminPartnerOnboarding from "@/pages/admin/PartnerOnboarding";
import AdminResetPartnerPassword from "@/pages/admin/ResetPartnerPassword";
import AdminGymManagement from "@/pages/admin/GymManagement";
import AdminFeaturedGyms from "@/pages/admin/FeaturedGyms";
import AdminGymVerification from "@/pages/admin/GymVerification";
import AdminAmenityCatalog from "@/pages/admin/AmenityCatalog";
import AdminCityAreaManagement from "@/pages/admin/CityAreaManagement";
import AdminWorkoutCatalog from "@/pages/admin/WorkoutCatalog";
import AdminUsers from "@/pages/admin/Users";
import AdminUserManagement from "@/pages/admin/UserManagement";
import AdminMemberships from "@/pages/admin/Memberships";
import AdminMembershipManagement from "@/pages/admin/MembershipManagement";
import AdminAnnualPlans from "@/pages/admin/AnnualPlans";
import AdminProducts from "@/pages/admin/Products";
import AdminCategories from "@/pages/admin/Categories";
import AdminOrders from "@/pages/admin/Orders";
import AdminVendors from "@/pages/admin/Vendors";
import AdminSsoCallback from "@/pages/admin/SsoCallback";
import AdminStaffManagement from "@/pages/admin/StaffManagement";
import AdminTeam from "@/pages/admin/AdminUsers";
import AdminAgencies from "@/pages/admin/Agencies";
import AdminReferrals from "@/pages/admin/Referrals";
import AdminTrainerBookings from "@/pages/admin/TrainerBookings";
import AdminPackageBookings from "@/pages/admin/PackageBookings";
import AdminYoactivMembers from "@/pages/admin/YoactivMembers";
import AdminYoactivPlans from "@/pages/admin/YoactivPlans";
import AdminHomeSlides from "@/pages/admin/HomeSlides";
import AdminFaqs from "@/pages/admin/Faqs";
import AdminCoupons from "@/pages/admin/Coupons";
import AdminNotifications from "@/pages/admin/Notifications";
import AdminLeads from "@/pages/admin/Leads";
import AdminBlogManagement from "@/pages/admin/BlogManagement";
import AdminPtManager from "@/pages/admin/PtManager";
import AdminMemberEngagement from "@/pages/admin/MemberEngagement";
import AdminMessagingSettings from "@/pages/admin/MessagingSettings";
import StaffLogin from "@/pages/staff/Login";
import StaffDashboard from "@/pages/staff/Dashboard";
import StaffPartnerOnboarding from "@/pages/staff/PartnerOnboarding";
import StaffPartners from "@/pages/staff/Partners";
import StaffPartnerDocuments from "@/pages/staff/PartnerDocuments";
import StaffResetPartnerPassword from "@/pages/staff/ResetPartnerPassword";
import StaffGymManagement from "@/pages/staff/GymManagement";
import StaffLeads from "@/pages/staff/Leads";
import StaffBlogManagement from "@/pages/staff/BlogManagement";
import StaffPtDashboard from "@/pages/staff/PtDashboard";
import Support from "@/pages/Support";
import AdminTickets from "@/pages/admin/Tickets";
import StaffTickets from "@/pages/staff/Tickets";
import PartnerTickets from "@/pages/partner/Tickets";
import PartnerComplaints from "@/pages/partner/Complaints";
import AdminComplaints from "@/pages/admin/Complaints";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

if (!clerkPubKey && typeof console !== "undefined") {
  // Member auth is disabled without a Clerk key. Admin portal still works.
  console.warn(
    "[Iconic Fitness] VITE_CLERK_PUBLISHABLE_KEY missing — member sign-in disabled.",
  );
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  layout: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/media/iconic-fitness-icon-transparent.png`,
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
    unsafe_disableDevelopmentModeWarnings: true,
  },
  variables: {
    colorPrimary: "#62982F",
    colorForeground: "hsl(222 47% 11%)",
    colorMutedForeground: "hsl(215 16% 47%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "hsl(222 47% 11%)",
    colorNeutral: "hsl(214 32% 91%)",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-white border border-slate-200 shadow-2xl rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-900 text-2xl font-bold",
    headerSubtitle: "text-slate-500",
    socialButtonsBlockButtonText: "text-slate-700 font-medium",
    formFieldLabel: "text-slate-700 font-medium",
    footerActionLink: "text-lime-700 hover:text-lime-800 font-semibold",
    footerActionText: "text-slate-500",
    dividerText: "text-slate-400",
    identityPreviewEditButton: "text-lime-700",
    formFieldSuccessText: "text-emerald-600",
    alertText: "text-slate-700",
    logoBox: "h-12 mb-2",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton:
      "border border-slate-200 hover:bg-slate-50 transition",
    formButtonPrimary:
      "!bg-gradient-to-r !from-lime-600 !to-green-700 hover:!opacity-95 text-white font-semibold",
    formFieldInput:
      "border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-lime-500/40",
    footerAction: "text-sm",
    dividerLine: "bg-slate-200",
    alert: "bg-red-50 border border-red-200",
    otpCodeFieldInput: "border border-slate-200",
    formFieldRow: "",
    main: "",
  },
};

// Public browsable routes use a top-nav shell (no member sidebar / profile)
const PUBLIC_ROUTES = [
  "/explore",
  "/gyms/",
  "/classes",
  "/trainers",
  "/memberships",
  "/offers",
  "/be-a-member",
  "/store",
  "/cart",
  "/checkout",
  "/blog",
  // Footer / info pages — must use the public top-nav shell, never the
  // signed-in member sidebar (these are reachable by signed-out visitors too).
  "/about",
  "/press",
  "/careers",
  "/become-a-trainer",
  "/corporate",
  "/help",
  "/contact",
  "/faqs",
  "/safety",
  "/refund",
  "/privacy",
  "/terms",
  "/cookies",
];

function isPublicPath(path: string) {
  return PUBLIC_ROUTES.some(
    (p) => path === p || path === p.replace(/\/$/, "") || path.startsWith(p),
  );
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <Dashboard />
        </Layout>
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function MemberShellRoutes() {
  const [location] = useLocation();
  const Shell = isPublicPath(location) ? PublicLayout : Layout;
  return (
    <Shell>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/explore" component={Explore} />
        <Route path="/gyms/:gymId" component={GymDetail} />
        <Route path="/classes" component={Classes} />
        <Route path="/classes/:classId" component={ClassDetail} />
        <Route path="/bookings" component={Bookings} />
        <Route path="/memberships" component={Memberships} />
        <Route path="/offers" component={Offers} />
        <Route path="/be-a-member" component={BeAMember} />
        <Route path="/trainers" component={Trainers} />
        <Route path="/trainers/:trainerId" component={TrainerDetail} />
        <Route path="/wallet" component={Wallet} />
        <Route path="/invoices" component={Invoices} />
        <Route path="/orders" component={Orders} />
        <Route path="/profile" component={Profile} />
        <Route path="/support" component={Support} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogDetail} />
        <Route path="/store" component={Store} />
        <Route path="/store/:slug" component={StoreDetail} />
        <Route path="/cart" component={Cart} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/about" component={() => <InfoPage slug="about" />} />
        <Route path="/press" component={() => <InfoPage slug="press" />} />
        <Route path="/careers" component={() => <InfoPage slug="careers" />} />
        <Route path="/become-a-trainer" component={() => <InfoPage slug="become-a-trainer" />} />
        <Route path="/corporate" component={() => <InfoPage slug="corporate" />} />
        <Route path="/help" component={() => <InfoPage slug="help" />} />
        <Route path="/contact" component={() => <InfoPage slug="contact" />} />
        <Route path="/faqs" component={() => <InfoPage slug="faqs" />} />
        <Route path="/safety" component={() => <InfoPage slug="safety" />} />
        <Route path="/refund" component={() => <InfoPage slug="refund" />} />
        <Route path="/privacy" component={() => <InfoPage slug="privacy" />} />
        <Route path="/terms" component={() => <InfoPage slug="terms" />} />
        <Route path="/cookies" component={() => <InfoPage slug="cookies" />} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function AppShell() {
  const [location] = useLocation();

  if (location === "/") {
    return <HomeRoute />;
  }

  if (location.startsWith("/sign-in") || location.startsWith("/sign-up")) {
    return (
      <Switch>
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
      </Switch>
    );
  }

  if (location.startsWith("/book-gx")) {
    return <BookGxClass />;
  }

  if (location.startsWith("/agency")) {
    return (
      <Switch>
        <Route path="/agency/login" component={AgencyLogin} />
        <Route path="/agency" component={AgencyDashboard} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (location.startsWith("/partner")) {
    return (
      <Switch>
        <Route path="/partner/login" component={PartnerLogin} />
        <Route path="/partner" component={PartnerDashboard} />
        <Route path="/partner/gyms" component={PartnerGyms} />
        <Route path="/partner/bookings" component={PartnerBookings} />
        <Route path="/partner/members" component={PartnerMembers} />
        <Route path="/partner/classes" component={PartnerClasses} />
        <Route path="/partner/trainers" component={PartnerTrainers} />
        <Route path="/partner/schedule" component={PartnerSchedule} />
        <Route path="/partner/gx-bookings" component={PartnerGxBookings} />
        <Route path="/partner/leads" component={PartnerLeads} />
        <Route path="/partner/trainer-bookings" component={PartnerTrainerBookings} />
        <Route path="/partner/package-bookings" component={PartnerPackageBookings} />
        <Route path="/partner/products" component={PartnerProducts} />
        <Route path="/partner/staff" component={PartnerTeam} />
        <Route path="/partner/tickets" component={PartnerTickets} />
        <Route path="/partner/complaints" component={PartnerComplaints} />
        <Route path="/partner/settings" component={PartnerSettings} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (location.startsWith("/vendor")) {
    return (
      <Switch>
        <Route path="/vendor/login" component={VendorLogin} />
        <Route path="/vendor" component={VendorDashboard} />
        <Route path="/vendor/products" component={VendorProducts} />
        <Route path="/vendor/orders" component={VendorOrders} />
        <Route path="/vendor/settings" component={VendorSettings} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (location.startsWith("/admin")) {
    return (
      <Switch>
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin/sso-callback" component={AdminSsoCallback} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/partners" component={AdminPartners} />
        <Route path="/admin/partner-onboarding" component={AdminPartnerOnboarding} />
        <Route path="/admin/reset-partner-password" component={AdminResetPartnerPassword} />
        <Route path="/admin/gyms" component={AdminGymManagement} />
        <Route path="/admin/featured-gyms" component={AdminFeaturedGyms} />
        <Route path="/admin/gym-verification" component={AdminGymVerification} />
        <Route path="/admin/amenities" component={AdminAmenityCatalog} />
        <Route path="/admin/locations" component={AdminCityAreaManagement} />
        <Route path="/admin/workouts" component={AdminWorkoutCatalog} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/user-management" component={AdminUserManagement} />
        <Route path="/admin/memberships" component={AdminMemberships} />
        <Route path="/admin/membership-management" component={AdminMembershipManagement} />
        <Route path="/admin/annual-plans" component={AdminAnnualPlans} />
        <Route path="/admin/vendors" component={AdminVendors} />
        <Route path="/admin/products" component={AdminProducts} />
        <Route path="/admin/categories" component={AdminCategories} />
        <Route path="/admin/orders" component={AdminOrders} />
        <Route path="/admin/staff" component={AdminStaffManagement} />
        <Route path="/admin/admins" component={AdminTeam} />
        <Route path="/admin/agencies" component={AdminAgencies} />
        <Route path="/admin/referrals" component={AdminReferrals} />
        <Route path="/admin/trainer-bookings" component={AdminTrainerBookings} />
        <Route path="/admin/package-bookings" component={AdminPackageBookings} />
        <Route path="/admin/yoactiv-members" component={AdminYoactivMembers} />
        <Route path="/admin/yoactiv-plans" component={AdminYoactivPlans} />
        <Route path="/admin/notifications" component={AdminNotifications} />
        <Route path="/admin/leads" component={AdminLeads} />
        <Route path="/admin/home-slider" component={AdminHomeSlides} />
        <Route path="/admin/faqs" component={AdminFaqs} />
        <Route path="/admin/coupons" component={AdminCoupons} />
        <Route path="/admin/blogs" component={AdminBlogManagement} />
        <Route path="/admin/pt" component={AdminPtManager} />
        <Route path="/admin/member-engagement" component={AdminMemberEngagement} />
        <Route path="/admin/messaging" component={AdminMessagingSettings} />
        <Route path="/admin/tickets" component={AdminTickets} />
        <Route path="/admin/complaints" component={AdminComplaints} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if (location.startsWith("/staff")) {
    return (
      <Switch>
        <Route path="/staff/login" component={StaffLogin} />
        <Route path="/staff" component={StaffDashboard} />
        <Route path="/staff/partner-onboarding" component={StaffPartnerOnboarding} />
        <Route path="/staff/partners" component={StaffPartners} />
        <Route path="/staff/partner-documents" component={StaffPartnerDocuments} />
        <Route path="/staff/reset-partner-password" component={StaffResetPartnerPassword} />
        <Route path="/staff/gym-management" component={StaffGymManagement} />
        <Route path="/staff/leads" component={StaffLeads} />
        <Route path="/staff/blogs" component={StaffBlogManagement} />
        <Route path="/staff/pt" component={StaffPtDashboard} />
        <Route path="/staff/tickets" component={StaffTickets} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return <MemberShellRoutes />;
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    // Skip on in-page anchors (no real route change)
    if (location.includes("#")) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);
  return null;
}

function ClerkRouterBridge({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  // Partner portal is fully isolated from Clerk. Admin portal optionally uses
  // Clerk only for Google sign-in on /admin/login + /admin/sso-callback.
  // Keep authenticated admin pages outside Clerk so its async initialization
  // cannot remount an open admin form (for example Change Username/Password).
  const adminNeedsClerk =
    location === "/admin/login" ||
    location.startsWith("/admin/login/") ||
    location === "/admin/sso-callback" ||
    location.startsWith("/admin/sso-callback/");
  if (
    location.startsWith("/partner") ||
    location.startsWith("/vendor") ||
    location.startsWith("/staff") ||
    (location.startsWith("/admin") && !adminNeedsClerk) ||
    !clerkPubKey
  ) {
    return <>{children}</>;
  }
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/`}
      signUpFallbackRedirectUrl={`${basePath}/`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      {children}
    </ClerkProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <ScrollToTop />
            <ClerkRouterBridge>
              <AppShell />
            </ClerkRouterBridge>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
