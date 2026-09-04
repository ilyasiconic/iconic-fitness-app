import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  UserPlus,
  Users as UsersIcon,
  KeyRound,
  Dumbbell,
  Star,
  ShieldCheck,
  UserCog,
  CreditCard,
  Settings2,
  Package,
  ShoppingBag,
  Store,
  Tags,
  LogOut,
  RefreshCcw,
  Sparkles,
  Activity,
  Headset,
  Building2,
  MapPin,
  Inbox,
  BookOpen,
  Megaphone,
  LifeBuoy,
  GalleryHorizontalEnd,
  CalendarClock,
  Gift as GiftIcon,
  MessageSquare,
  Menu,
  HelpCircle,
  TicketPercent,
  X,
} from "lucide-react";
import { adminApi, type AdminUser } from "@/lib/adminApi";
import { NotificationBell } from "@/components/NotificationBell";

type Item = {
  label: string;
  href: string;
  icon: ReactNode;
};
type Section = { title: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: "Core Management",
    items: [
      {
        label: "Dashboard",
        href: "/admin",
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Partner Management",
    items: [
      {
        label: "Partner Onboarding",
        href: "/admin/partner-onboarding",
        icon: <UserPlus className="h-4 w-4" />,
      },
      {
        label: "Partners",
        href: "/admin/partners",
        icon: <UsersIcon className="h-4 w-4" />,
      },
      {
        label: "Reset Partners Password",
        href: "/admin/reset-partner-password",
        icon: <KeyRound className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Gym Management",
    items: [
      {
        label: "Gym Management",
        href: "/admin/gyms",
        icon: <Dumbbell className="h-4 w-4" />,
      },
      {
        label: "Featured Gyms",
        href: "/admin/featured-gyms",
        icon: <Star className="h-4 w-4" />,
      },
      {
        label: "Gym Verification",
        href: "/admin/gym-verification",
        icon: <ShieldCheck className="h-4 w-4" />,
      },
      {
        label: "Amenities Catalog",
        href: "/admin/amenities",
        icon: <Sparkles className="h-4 w-4" />,
      },
      {
        label: "Cities & Areas",
        href: "/admin/locations",
        icon: <MapPin className="h-4 w-4" />,
      },
      {
        label: "Workouts Catalog",
        href: "/admin/workouts",
        icon: <Activity className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "User Management",
    items: [
      {
        label: "Users",
        href: "/admin/users",
        icon: <UsersIcon className="h-4 w-4" />,
      },
      {
        label: "User Management",
        href: "/admin/user-management",
        icon: <UserCog className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Membership Management",
    items: [
      {
        label: "Memberships",
        href: "/admin/memberships",
        icon: <CreditCard className="h-4 w-4" />,
      },
      {
        label: "Packages",
        href: "/admin/annual-plans",
        icon: <CalendarClock className="h-4 w-4" />,
      },
      {
        label: "Membership Management",
        href: "/admin/membership-management",
        icon: <Settings2 className="h-4 w-4" />,
      },
      {
        label: "Gym Members (YoActiv)",
        href: "/admin/yoactiv-members",
        icon: <UserCog className="h-4 w-4" />,
      },
      {
        label: "YoActiv Plans",
        href: "/admin/yoactiv-plans",
        icon: <CreditCard className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Admin Team",
    items: [
      {
        label: "Admin Users",
        href: "/admin/admins",
        icon: <ShieldCheck className="h-4 w-4" />,
      },
      {
        label: "Staff Management",
        href: "/admin/staff",
        icon: <Headset className="h-4 w-4" />,
      },
      {
        label: "Agency Accounts",
        href: "/admin/agencies",
        icon: <Building2 className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Leads & CRM",
    items: [
      {
        label: "Leads (CRM)",
        href: "/admin/leads",
        icon: <Inbox className="h-4 w-4" />,
      },
      {
        label: "Tickets",
        href: "/admin/tickets",
        icon: <LifeBuoy className="h-4 w-4" />,
      },
      {
        label: "Complaints",
        href: "/admin/complaints",
        icon: <LifeBuoy className="h-4 w-4" />,
      },
      {
        label: "PT Manager",
        href: "/admin/pt",
        icon: <Dumbbell className="h-4 w-4" />,
      },
      {
        label: "Member Engagement",
        href: "/admin/member-engagement",
        icon: <Dumbbell className="h-4 w-4" />,
      },
      {
        label: "PT Bookings",
        href: "/admin/trainer-bookings",
        icon: <CalendarClock className="h-4 w-4" />,
      },
      {
        label: "Package Purchases",
        href: "/admin/package-bookings",
        icon: <CalendarClock className="h-4 w-4" />,
      },
      {
        label: "Refer & Earn",
        href: "/admin/referrals",
        icon: <GiftIcon className="h-4 w-4" />,
      },
      {
        label: "Messaging (WhatsApp/SMS)",
        href: "/admin/messaging",
        icon: <MessageSquare className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Content",
    items: [
      {
        label: "Home Slider",
        href: "/admin/home-slider",
        icon: <GalleryHorizontalEnd className="h-4 w-4" />,
      },
      {
        label: "Blog Posts",
        href: "/admin/blogs",
        icon: <BookOpen className="h-4 w-4" />,
      },
      {
        label: "FAQs & AI Knowledge",
        href: "/admin/faqs",
        icon: <HelpCircle className="h-4 w-4" />,
      },
      {
        label: "Coupons",
        href: "/admin/coupons",
        icon: <TicketPercent className="h-4 w-4" />,
      },
      {
        label: "Notifications",
        href: "/admin/notifications",
        icon: <Megaphone className="h-4 w-4" />,
      },
    ],
  },
  {
    title: "Store Management",
    items: [
      {
        label: "Vendors",
        href: "/admin/vendors",
        icon: <Store className="h-4 w-4" />,
      },
      {
        label: "Products",
        href: "/admin/products",
        icon: <Package className="h-4 w-4" />,
      },
      {
        label: "Categories",
        href: "/admin/categories",
        icon: <Tags className="h-4 w-4" />,
      },
      {
        label: "Orders",
        href: "/admin/orders",
        icon: <ShoppingBag className="h-4 w-4" />,
      },
    ],
  },
];

export function AdminLayout({
  children,
  title,
  actions,
}: {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
}) {
  const [location, navigate] = useLocation();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    adminApi
      .me()
      .then((u) => setAdmin(u))
      .catch(() => navigate("/admin/login"))
      .finally(() => setLoading(false));
  }, [navigate]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  // Escape to close + lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } catch {
      // ignore
    }
    navigate("/admin/login");
  };

  if (loading) {
    return (
      <div className="theme-portal min-h-screen bg-lime-50 flex items-center justify-center text-slate-500">
        Loading admin portal...
      </div>
    );
  }

  // The login redirect and this state update can land in separate renders.
  // Never mount protected page children during that gap: their API requests
  // would fail with an unhandled 401 and replace the page with an error overlay.
  if (!admin) {
    return (
      <div className="theme-portal min-h-screen bg-lime-50 flex items-center justify-center text-slate-500">
        Returning to admin login...
      </div>
    );
  }

  return (
    <div className="theme-portal min-h-screen bg-lime-50/40 text-slate-900 lg:flex">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 max-w-[85vw] lg:w-64 shrink-0 bg-white border-r border-lime-100 flex flex-col transform transition-transform duration-300 ease-out lg:transform-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-5 border-b border-lime-100 relative">
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-lime-50 hover:text-lime-600"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="rounded-xl bg-gradient-to-br from-lime-500 to-green-500 p-4 text-center text-white shadow-[0_12px_30px_-12px_rgba(101, 163, 13,0.55)]">
            <div className="text-2xl font-extrabold tracking-tight">Iconic Fitness</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/85 mt-1">
              Go To Any Gym
            </div>
            <div className="mt-3 text-[10px] uppercase tracking-[0.25em] text-white font-bold">
              Admin Portal
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {SECTIONS.map((sec) => (
            <div key={sec.title}>
              <div className="px-2 mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                {sec.title}
              </div>
              <div className="space-y-1">
                {sec.items.map((item) => {
                  const active =
                    item.href === "/admin"
                      ? location === "/admin"
                      : location === item.href ||
                        location.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-gradient-to-r from-lime-500 to-lime-600 text-white shadow-md shadow-lime-500/30"
                          : "text-slate-600 hover:bg-lime-50 hover:text-lime-600"
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-lime-100 space-y-3">
          <div className="rounded-lg bg-lime-50 border border-lime-100 p-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-2 font-bold">
              Logged In As
            </div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-lime-500 to-green-500 flex items-center justify-center text-white text-sm font-bold">
                {admin?.name?.[0]?.toUpperCase() ?? "A"}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {admin?.name ?? "Admin"}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {admin?.email}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-lime-50 hover:bg-lime-100 text-lime-700 text-sm font-semibold border border-lime-100 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 px-4 lg:px-8 flex items-center justify-between border-b border-lime-100 bg-white/85 backdrop-blur sticky top-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden h-9 w-9 flex items-center justify-center rounded-lg border border-lime-200 text-lime-600 hover:bg-lime-50 shrink-0"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base lg:text-xl font-bold text-slate-900 truncate">
              {title ?? "Dashboard"}
            </h1>
          </div>
          <div className="flex items-center gap-2 lg:gap-3 shrink-0">
            {actions}
            <NotificationBell
              api={{
                list: () => adminApi.notifications.myInbox(),
                markRead: (id) => adminApi.notifications.markRead(id),
                markAllRead: () => adminApi.notifications.markAllRead(),
              }}
              theme="portal"
            />
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-2.5 lg:px-3 py-1.5 rounded-lg border border-lime-200 hover:border-lime-500 text-slate-600 hover:text-lime-600 text-sm transition-colors bg-white"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Refresh Data</span>
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

export function AdminCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-white border border-lime-100 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}
