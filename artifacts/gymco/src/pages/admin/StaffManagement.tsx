import { useEffect, useRef, useState, type FormEvent } from "react";
import { AdminLayout, AdminCard } from "@/components/admin/AdminLayout";
import { adminApi } from "@/lib/adminApi";
import { PERMISSION_LABELS } from "@/lib/staffApi";
import { Dumbbell, KeyRound, Trash2, UserPlus } from "lucide-react";

type Staff = {
  id: number;
  name: string;
  email: string;
  username: string | null;
  gymId: number | null;
  gymName: string | null;
  yoactivStaffId: string | null;
  isActive: boolean;
  permissions: string[];
  createdAt: string;
};

type StaffBranch = {
  gymId: number;
  gymName: string;
  gymArea: string;
  yoactivBranchId: number | null;
  label: string;
};

const ALL_PERMS = [
  "partner.onboard",
  "partner.view",
  "partner.document_upload",
  "partner.assign_login",
  "gym.manage",
  "blog.manage",
  "lead.manage",
  "pt.manage",
];

const inputCls =
  "w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-lime-500/60";

function PermissionCheckboxes({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (p: string) => {
    if (value.includes(p)) onChange(value.filter((x) => x !== p));
    else onChange([...value, p]);
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {ALL_PERMS.map((p) => {
        const on = value.includes(p);
        return (
          <label
            key={p}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
              on
                ? "bg-gradient-to-r from-lime-500/15 to-green-500/10 border-lime-500/60"
                : "bg-slate-800 border-slate-700 hover:border-lime-500/40"
            }`}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => toggle(p)}
              className="rounded border-slate-600 bg-slate-900 text-lime-500 focus:ring-lime-500/60"
            />
            <span className="text-sm font-medium text-slate-100">
              {PERMISSION_LABELS[p] ?? p}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export type StaffPrefill = {
  name: string;
  email: string | null;
  gymId: number | null;
  yoactivStaffId: string;
  seq: number;
};

function CreateStaffForm({
  onCreated,
  prefill,
  branches,
}: {
  onCreated: () => void;
  prefill: StaffPrefill | null;
  branches: StaffBranch[];
}) {
  const [f, setF] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    gymId: "",
    yoactivStaffId: "",
    permissions: [] as string[],
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    username: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  // "Create login" from the YoActiv trainers panel prefills the trainer's
  // name here and jumps to the form so the admin only types email + password.
  useEffect(() => {
    if (!prefill) return;
    setF((prev) => ({
      ...prev,
      name: prefill.name,
      email: prefill.email ?? prev.email,
      gymId: prefill.gymId ? String(prefill.gymId) : prev.gymId,
      yoactivStaffId: prefill.yoactivStaffId,
      permissions: prev.permissions.includes("pt.manage")
        ? prev.permissions
        : [...prev.permissions, "pt.manage"],
    }));
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    emailRef.current?.focus();
  }, [prefill]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await adminApi.staff.create({
        name: f.name,
        email: f.email,
        username: f.username.trim() || undefined,
        password: f.password,
        gymId: f.gymId ? Number(f.gymId) : null,
        yoactivStaffId: f.yoactivStaffId || null,
        permissions: f.permissions,
        isActive: true,
      });
      setOk(true);
      // Show the credentials the admin just set so they can be shared with
      // the staff member. This is the ONLY time the password is visible —
      // it's stored hashed and can never be viewed again, only reset.
      setCreated({
        name: f.name,
        email: f.email,
        username: f.username.trim(),
        password: f.password,
      });
      setCopied(false);
      setF({
        name: "",
        email: "",
        username: "",
        password: "",
        gymId: "",
        yoactivStaffId: "",
        permissions: [],
      });
      onCreated();
      setTimeout(() => setOk(false), 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={cardRef}>
    <AdminCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <UserPlus className="h-5 w-5 text-lime-400" />
        <h2 className="text-lg font-bold text-white">Create Staff Member</h2>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400 block mb-1.5">
              Name
            </label>
            <input
              required
              className={inputCls}
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="Ananya Sharma"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400 block mb-1.5">
              Email
            </label>
            <input
              required
              type="email"
              ref={emailRef}
              className={inputCls}
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
              placeholder="staff@iconicfitnessindia.com"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400 block mb-1.5">
              Username <span className="text-slate-500 normal-case">(optional)</span>
            </label>
            <input
              className={inputCls}
              value={f.username}
              onChange={(e) => setF({ ...f, username: e.target.value })}
              placeholder="e.g. trainer.ananya"
              pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}"
              title="3-30 characters: letters, numbers, dot, dash or underscore"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400 block mb-1.5">
              Initial Password
            </label>
            <input
              required
              minLength={6}
              type="text"
              className={inputCls}
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              placeholder="At least 6 characters"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs uppercase tracking-wide text-slate-400 block mb-1.5">
              Branch <span className="text-red-400 normal-case">(required)</span>
            </label>
            <select
              className={inputCls}
              value={f.gymId}
              required
              onChange={(e) => setF({ ...f, gymId: e.target.value })}
            >
              <option value="">Select branch</option>
              {branches.map((b) => (
                <option key={b.gymId} value={b.gymId}>
                  {b.label}
                </option>
              ))}
            </select>
            <div className="text-[11px] text-slate-500 mt-1">
              Active PT staff appear only in this branch inside the mobile app.
            </div>
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400 block mb-2">
            Permissions
          </label>
          <PermissionCheckboxes
            value={f.permissions}
            onChange={(next) => setF({ ...f, permissions: next })}
          />
          <div className="text-[11px] text-slate-500 mt-2">
            Staff sign in at <code>/staff/login</code> or in the mobile app's
            Studio Login — with their email or username + password, or with
            Google using this email. For trainers, take the email IDs from Gym
            Members → View Active.
          </div>
        </div>
        {err && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {err}
          </div>
        )}
        {ok && (
          <div className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
            Staff member created.
          </div>
        )}
        {created && (
          <div className="bg-slate-800/70 border border-lime-500/40 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-lime-300">
                Login details for {created.name} — share these now
              </div>
              <button
                type="button"
                onClick={() => setCreated(null)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ✕ Dismiss
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm font-mono">
              <div>
                <span className="text-slate-500">Email: </span>
                <span className="text-white">{created.email}</span>
              </div>
              {created.username && (
                <div>
                  <span className="text-slate-500">Username: </span>
                  <span className="text-white">{created.username}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500">Password: </span>
                <span className="text-white">{created.password}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  const lines = [
                    `Iconic Fitness — Studio login for ${created.name}`,
                    `Email: ${created.email}`,
                    created.username ? `Username: ${created.username}` : null,
                    `Password: ${created.password}`,
                    `Login: mobile app → Studio Login, or /staff/login`,
                  ].filter(Boolean);
                  navigator.clipboard
                    .writeText(lines.join("\n"))
                    .then(() => setCopied(true))
                    .catch(() => {});
                }}
                className="text-xs px-3 py-1.5 rounded bg-lime-500/20 text-lime-300 border border-lime-500/40 hover:bg-lime-500/30"
              >
                {copied ? "Copied ✓" : "Copy login details"}
              </button>
              <span className="text-[11px] text-slate-500">
                The password is shown only now — once dismissed it can only be
                reset, never viewed.
              </span>
            </div>
          </div>
        )}
        <button
          disabled={busy}
          className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-lime-500 to-lime-600 hover:from-lime-400 hover:to-lime-500 text-white font-semibold transition-colors disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create Staff"}
        </button>
      </form>
    </AdminCard>
    </div>
  );
}

type YoactivBranch = {
  branchId: number;
  gymId: number | null;
  branchName: string | null;
  gymLabel: string | null;
};
type YoactivRosterMember = {
  id: string;
  name: string;
  mobile: string;
  photoUrl: string | null;
  role: "trainer" | "staff";
  /** Email from their YoActiv MEMBER registration (matched by mobile). */
  memberEmail: string | null;
};
type RoleFilter = "all" | "trainer" | "staff";

/**
 * YoActiv trainer roster, right inside Staff Management. YoActiv only gives
 * us name + mobile for trainers (no email, no passwords) — login details
 * live in OUR staff table. This panel shows which trainers already have a
 * login (matched by name) and prefills the create form for the rest.
 */
function YoactivTrainersPanel({
  staffRows,
  onCreateLogin,
  onLinkLogin,
}: {
  staffRows: Staff[];
  onCreateLogin: (
    name: string,
    email: string | null,
    gymId: number | null,
    yoactivStaffId: string,
  ) => void;
  onLinkLogin: (
    staff: Staff,
    gymId: number,
    yoactivStaffId: string,
  ) => Promise<void>;
}) {
  const [branches, setBranches] = useState<YoactivBranch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [roster, setRoster] = useState<YoactivRosterMember[]>([]);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminApi.yoactiv
      .branches()
      .then((rows: YoactivBranch[]) => {
        setBranches(rows);
        if (rows.length > 0) setBranchId(rows[0].branchId);
      })
      .catch(() => setErr("Couldn't load YoActiv branches"));
  }, []);

  useEffect(() => {
    if (branchId == null) return;
    setLoading(true);
    setErr(null);
    adminApi.yoactiv
      .staff(branchId)
      .then((rows) => setRoster(rows as YoactivRosterMember[]))
      .catch(() => setErr("Couldn't load the staff roster"))
      .finally(() => setLoading(false));
  }, [branchId]);

  const counts = {
    all: roster.length,
    trainer: roster.filter((m) => m.role === "trainer").length,
    staff: roster.filter((m) => m.role === "staff").length,
  };
  const visible =
    roleFilter === "all"
      ? roster
      : roster.filter((m) => m.role === roleFilter);

  const filterBtn = (value: RoleFilter, label: string) => (
    <button
      key={value}
      onClick={() => setRoleFilter(value)}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        roleFilter === value
          ? "bg-lime-500/20 text-lime-300 border-lime-500/50"
          : "bg-slate-800 text-slate-400 border-slate-700 hover:border-lime-500/40"
      }`}
    >
      {label}{" "}
      <span className="opacity-70">({counts[value]})</span>
    </button>
  );

  return (
    <AdminCard className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-5 w-5 text-lime-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            YoActiv Staff — Login Status
          </h2>
        </div>
        {branches.length > 1 && (
          <select
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-500/60"
            value={branchId ?? ""}
            onChange={(e) => setBranchId(Number(e.target.value))}
          >
            {branches.map((b) => (
              <option key={b.branchId} value={b.branchId}>
                {b.gymLabel ?? b.branchName ?? `Branch ${b.branchId}`}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="px-5 py-3 border-b border-slate-800/60 flex flex-wrap items-center gap-2">
        {filterBtn("all", "All")}
        {filterBtn("trainer", "Trainers")}
        {filterBtn("staff", "Other staff (MCs, sales…)")}
      </div>
      <div className="px-5 py-3 text-[11px] text-slate-500 border-b border-slate-800/60 leading-relaxed">
        YoActiv shares only each person's name and mobile — email IDs and
        passwords are never stored in YoActiv, and it doesn't label exact
        designations, so people are grouped as Trainers (PT roster) and Other
        staff. Login details live here: an Active or Inactive badge means the
        trainer is already linked to this branch. For the rest, press{" "}
        <span className="text-slate-300">Create login</span>, add their email
        ID (copy it from Gym Members → View Active if they're also a member)
        and set a password.
      </div>
      {err && (
        <div className="px-5 py-3 text-sm text-red-400">{err}</div>
      )}
      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-slate-500">
          Loading staff roster…
        </div>
      ) : visible.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-500">
          No staff found for this branch.
        </div>
      ) : (
        <ul className="divide-y divide-slate-800/60">
          {visible.map((t) => {
            const selectedBranch = branches.find((b) => b.branchId === branchId);
            const existing =
              staffRows.find(
                (s) =>
                  s.yoactivStaffId === t.id &&
                  s.gymId === selectedBranch?.gymId,
              ) ??
              [...staffRows]
                .reverse()
                .find(
                  (s) =>
                    !s.yoactivStaffId &&
                    s.name.trim().toLowerCase() ===
                      t.name.trim().toLowerCase(),
                );
            const linked =
              existing?.yoactivStaffId === t.id &&
              existing.gymId === selectedBranch?.gymId;
            return (
              <li
                key={t.id}
                className="px-5 py-3 flex items-center gap-4"
              >
                {t.photoUrl ? (
                  <img
                    src={t.photoUrl}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover border border-slate-700"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-lime-400">
                    {t.name.trim().charAt(0).toUpperCase() || "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white truncate">
                    {t.name}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        t.role === "trainer"
                          ? "bg-lime-500/10 text-lime-300 border-lime-500/30"
                          : "bg-sky-500/10 text-sky-300 border-sky-500/30"
                      }`}
                    >
                      {t.role === "trainer" ? "Trainer" : "Staff"}
                    </span>
                    <span>{t.mobile || "No mobile on record"}</span>
                  </div>
                  {t.memberEmail ? (
                    <div className="text-xs text-slate-300 mt-0.5 truncate">
                      <span className="text-slate-500">Registered email:</span>{" "}
                      {t.memberEmail}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      No email in YoActiv (not registered as a member)
                    </div>
                  )}
                </div>
                {existing ? (
                  <div className="text-right">
                    {linked ? (
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md border ${
                          existing.isActive
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                            : "bg-slate-700/60 text-slate-400 border-slate-600"
                        }`}
                      >
                        {existing.isActive ? "Active login" : "Inactive login"}
                      </span>
                    ) : selectedBranch?.gymId ? (
                      <button
                        type="button"
                        onClick={() =>
                          void onLinkLogin(existing, selectedBranch.gymId!, t.id)
                        }
                        className="text-xs px-3 py-1.5 rounded bg-sky-500/15 text-sky-200 font-semibold border border-sky-500/35 hover:bg-sky-500/25"
                      >
                        Link to this branch
                      </button>
                    ) : (
                      <span className="text-[11px] text-amber-300">
                        Map this gym to YoActiv first
                      </span>
                    )}
                    <div className="text-[11px] text-slate-400 mt-1 font-mono truncate max-w-[180px]">
                      {existing.username
                        ? `@${existing.username}`
                        : existing.email}
                    </div>
                  </div>
                ) : selectedBranch?.gymId ? (
                  <button
                    type="button"
                    onClick={() =>
                      onCreateLogin(
                        t.name.trim(),
                        t.memberEmail,
                        selectedBranch?.gymId ?? null,
                        t.id,
                      )
                    }
                    className="text-xs px-3 py-1.5 rounded bg-lime-500/20 text-black font-semibold border border-lime-500/40 hover:bg-lime-500/30 shrink-0"
                  >
                    Create login
                  </button>
                ) : (
                  <span className="text-[11px] text-amber-300 text-right max-w-[150px]">
                    Map this gym to YoActiv first
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AdminCard>
  );
}

function EditStaffRow({
  row,
  onChanged,
  branches,
}: {
  row: Staff;
  onChanged: () => void;
  branches: StaffBranch[];
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [username, setUsername] = useState(row.username ?? "");
  const [gymId, setGymId] = useState(row.gymId ? String(row.gymId) : "");
  const [editErr, setEditErr] = useState<string | null>(null);
  const [perms, setPerms] = useState<string[]>(row.permissions ?? []);
  const [isActive, setIsActive] = useState(row.isActive);
  const [resetting, setResetting] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [changingUser, setChangingUser] = useState(false);
  const [newUsername, setNewUsername] = useState(row.username ?? "");
  const [userErr, setUserErr] = useState<string | null>(null);
  const [lastReset, setLastReset] = useState<string | null>(null);
  const [resetCopied, setResetCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setEditErr(null);
    try {
      await adminApi.staff.update(row.id, {
        name,
        username: username.trim() || null,
        gymId: gymId ? Number(gymId) : null,
        permissions: perms,
        isActive,
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const resetPwd = async () => {
    if (newPwd.length < 6) return;
    setBusy(true);
    try {
      await adminApi.staff.resetPassword(row.id, newPwd);
      setLastReset(newPwd);
      setResetCopied(false);
      setNewPwd("");
      setResetting(false);
    } finally {
      setBusy(false);
    }
  };

  const saveUsername = async () => {
    setBusy(true);
    setUserErr(null);
    try {
      await adminApi.staff.update(row.id, {
        username: newUsername.trim() || null,
      });
      setChangingUser(false);
      onChanged();
    } catch (e) {
      setUserErr(e instanceof Error ? e.message : "Failed to save username");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    setBusy(true);
    try {
      await adminApi.staff.update(row.id, { isActive: !row.isActive });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete staff member "${row.name}"?`)) return;
    setBusy(true);
    try {
      await adminApi.staff.remove(row.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-slate-800/60 align-top">
      <td className="px-5 py-4">
        {editing ? (
          <div className="space-y-2">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username (optional)"
            />
            <select
              className={inputCls}
              value={gymId}
              onChange={(e) => setGymId(e.target.value)}
            >
              <option value="">Select branch</option>
              {branches.map((b) => (
                <option key={b.gymId} value={b.gymId}>
                  {b.label}
                </option>
              ))}
            </select>
            {editErr && (
              <div className="text-xs text-red-400">{editErr}</div>
            )}
          </div>
        ) : (
          <div className="font-medium text-white">{row.name}</div>
        )}
        <div className="text-xs text-slate-400 mt-1">{row.email}</div>
        {!editing && (
          <div className="text-[11px] text-sky-600 mt-0.5">
            {row.gymName ?? "No branch assigned"}
          </div>
        )}
        {!editing && row.username ? (
          <div className="text-[11px] text-lime-300/80 mt-0.5 font-mono">
            @{row.username}
          </div>
        ) : null}
      </td>
      <td className="px-5 py-4">
        {editing ? (
          <PermissionCheckboxes value={perms} onChange={setPerms} />
        ) : row.permissions.length === 0 ? (
          <span className="text-xs text-slate-500">No permissions</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {row.permissions.map((p) => (
              <span
                key={p}
                className="text-[11px] px-2 py-0.5 rounded-md bg-lime-500/15 text-lime-300 border border-lime-500/30"
              >
                {PERMISSION_LABELS[p] ?? p}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-5 py-4">
        {editing ? (
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-600 bg-slate-900 text-lime-500 focus:ring-lime-500/60"
            />
            Active
          </label>
        ) : (
          <div className="flex flex-col gap-1.5 items-start">
            <span
              className={`text-[11px] px-2 py-0.5 rounded-md border ${
                row.isActive
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-700/40 text-slate-400 border-slate-600/40"
              }`}
            >
              {row.isActive ? "Active" : "Inactive"}
            </span>
            <button
              onClick={toggleActive}
              disabled={busy}
              className={`text-[11px] px-2 py-0.5 rounded border disabled:opacity-50 ${
                row.isActive
                  ? "bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/20"
                  : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20"
              }`}
            >
              {row.isActive ? "Deactivate" : "Activate"}
            </button>
          </div>
        )}
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-col gap-2">
          {editing ? (
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={busy || !gymId}
                className="text-xs px-3 py-1.5 rounded bg-lime-500/20 text-lime-300 border border-lime-500/40 hover:bg-lime-500/30 disabled:opacity-60"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setName(row.name);
                  setUsername(row.username ?? "");
                  setGymId(row.gymId ? String(row.gymId) : "");
                  setPerms(row.permissions ?? []);
                  setIsActive(row.isActive);
                  setEditErr(null);
                  setEditing(false);
                }}
                className="text-xs px-3 py-1.5 rounded bg-slate-700/40 text-slate-300 border border-slate-600/40"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs px-3 py-1.5 rounded bg-slate-700/60 text-slate-200 border border-slate-600/60 hover:border-lime-500/40 w-fit"
            >
              Edit
            </button>
          )}
          {changingUser ? (
            <div className="space-y-1">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="New username"
                  className="text-xs px-2 py-1 rounded bg-white border border-slate-300 text-black placeholder:text-slate-400 w-32"
                />
                <button
                  onClick={saveUsername}
                  disabled={busy}
                  className="text-xs px-2 py-1 rounded bg-lime-500/20 text-lime-300 border border-lime-500/40 disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setChangingUser(false);
                    setNewUsername(row.username ?? "");
                    setUserErr(null);
                  }}
                  className="text-xs px-2 py-1 rounded bg-slate-700/40 text-slate-300 border border-slate-600/40"
                >
                  ✕
                </button>
              </div>
              {userErr && (
                <div className="text-[11px] text-red-400 max-w-[200px]">
                  {userErr}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNewUsername(row.username ?? "");
                setChangingUser(true);
              }}
              className="text-xs px-3 py-1.5 rounded bg-slate-700/60 text-slate-200 border border-slate-600/60 hover:border-lime-500/40 w-fit"
            >
              Change Username
            </button>
          )}
          {resetting ? (
            <div className="flex gap-1">
              <input
                type="text"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="New password"
                className="text-xs px-2 py-1 rounded bg-white border border-slate-300 text-black placeholder:text-slate-400 w-32"
              />
              <button
                onClick={resetPwd}
                disabled={busy || newPwd.length < 6}
                className="text-xs px-2 py-1 rounded bg-lime-500/20 text-lime-300 border border-lime-500/40 disabled:opacity-40"
              >
                Set
              </button>
              <button
                onClick={() => {
                  setResetting(false);
                  setNewPwd("");
                }}
                className="text-xs px-2 py-1 rounded bg-slate-700/40 text-slate-300 border border-slate-600/40"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setResetting(true)}
              className="text-xs px-3 py-1.5 rounded bg-slate-700/60 text-slate-200 border border-slate-600/60 hover:border-lime-500/40 inline-flex items-center gap-1 w-fit"
            >
              <KeyRound className="h-3 w-3" /> Change Password
            </button>
          )}
          {lastReset && (
            <div className="text-xs bg-slate-800/70 border border-lime-500/40 rounded-lg p-2 space-y-1 max-w-[240px]">
              <div className="text-lime-300 font-semibold">
                New password set:
              </div>
              <div className="font-mono text-white break-all">{lastReset}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard
                      .writeText(
                        `Iconic Fitness — new password for ${row.name}\n${
                          row.username ? `Username: ${row.username}\n` : ""
                        }Email: ${row.email}\nPassword: ${lastReset}`,
                      )
                      .then(() => setResetCopied(true))
                      .catch(() => {});
                  }}
                  className="px-2 py-0.5 rounded bg-lime-500/20 text-lime-300 border border-lime-500/40"
                >
                  {resetCopied ? "Copied ✓" : "Copy"}
                </button>
                <button
                  onClick={() => setLastReset(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  Dismiss
                </button>
              </div>
              <div className="text-[10px] text-slate-500">
                Visible only now — share it, then dismiss.
              </div>
            </div>
          )}
          <button
            onClick={remove}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20 inline-flex items-center gap-1 w-fit disabled:opacity-60"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminStaffManagement() {
  const [rows, setRows] = useState<Staff[]>([]);
  const [branches, setBranches] = useState<StaffBranch[]>([]);
  const [yoactivBranches, setYoactivBranches] = useState<YoactivBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<StaffPrefill | null>(null);
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<
    "active" | "inactive" | "all"
  >("active");

  const load = async () => {
    setLoadError(null);
    try {
      const data = (await adminApi.staff.list()) as Staff[];
      setRows(data);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Couldn't load staff members",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    adminApi.staff
      .branches()
      .then((data) => setBranches(data as StaffBranch[]))
      .catch(() => setBranches([]));
    adminApi.yoactiv
      .branches()
      .then((data) => setYoactivBranches(data as YoactivBranch[]))
      .catch(() => setYoactivBranches([]));
  }, []);

  const filteredRows = rows.filter((row) => {
    const branchMatches =
      branchFilter === "all"
        ? true
        : branchFilter === "unassigned"
          ? row.gymId === null
          : row.gymId ===
            (yoactivBranches.find(
              (branch) => branch.branchId === Number(branchFilter),
            )?.gymId ?? -1);
    const statusMatches =
      statusFilter === "all"
        ? true
        : statusFilter === "active"
          ? row.isActive
          : !row.isActive;
    return branchMatches && statusMatches;
  });

  return (
    <AdminLayout title="Staff Management">
      <div className="space-y-6">
        <CreateStaffForm
          onCreated={load}
          prefill={prefill}
          branches={branches}
        />

        <YoactivTrainersPanel
          staffRows={rows}
          onCreateLogin={(name, email, gymId, yoactivStaffId) =>
            setPrefill((p) => ({
              name,
              email,
              gymId,
              yoactivStaffId,
              seq: (p?.seq ?? 0) + 1,
            }))
          }
          onLinkLogin={async (staff, gymId, yoactivStaffId) => {
            try {
              await adminApi.staff.update(staff.id, {
                gymId,
                yoactivStaffId,
                permissions: staff.permissions.includes("pt.manage")
                  ? staff.permissions
                  : [...staff.permissions, "pt.manage"],
              });
              await load();
            } catch (e) {
              window.alert(
                e instanceof Error
                  ? e.message
                  : "Couldn't link this trainer to the branch",
              );
            }
          }}
        />

        <AdminCard className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Staff Members
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-sm text-black"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
              >
                <option value="all">All branches</option>
                {yoactivBranches.map((b) => (
                  <option key={b.branchId} value={b.branchId}>
                    {b.branchName ??
                      b.gymLabel ??
                      `Branch ${b.branchId}`}
                  </option>
                ))}
                <option value="unassigned">No branch assigned</option>
              </select>
              <select
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-sm text-black"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as "active" | "inactive" | "all",
                  )
                }
              >
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
                <option value="all">Active and inactive</option>
              </select>
              <span className="text-xs text-slate-500">
                {filteredRows.length} shown / {rows.length} total
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Permissions</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadError ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-red-500">
                      {loadError}. Refresh the page or sign in again.
                    </td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      Loading…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      No staff members yet. Create one above.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <EditStaffRow
                      key={r.id}
                      row={r}
                      onChanged={load}
                      branches={branches}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  );
}
