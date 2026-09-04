import { useEffect, useState, type FormEvent } from "react";
import { AdminLayout, AdminCard } from "@/components/admin/AdminLayout";
import { adminApi, type ReferralSettings } from "@/lib/adminApi";
import { Gift, Save } from "lucide-react";

const inputCls =
  "w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-lime-500/60";

export default function AdminReferrals() {
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bonusPoints, setBonusPoints] = useState<number | null>(null);
  const [bonusSaving, setBonusSaving] = useState(false);
  const [bonusMessage, setBonusMessage] = useState<string | null>(null);
  const [bonusError, setBonusError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.referrals
      .settings()
      .then(setSettings)
      .catch(() => setError("Could not load referral settings"))
      .finally(() => setLoading(false));
    adminApi.signupBonus
      .get()
      .then((r) => setBonusPoints(r.points))
      .catch(() => setBonusError("Could not load the welcome bonus setting"));
  }, []);

  const saveBonus = async (e: FormEvent) => {
    e.preventDefault();
    if (bonusPoints === null) return;
    setBonusSaving(true);
    setBonusMessage(null);
    setBonusError(null);
    try {
      const saved = await adminApi.signupBonus.set(bonusPoints);
      setBonusPoints(saved.points);
      setBonusMessage("Welcome bonus saved");
    } catch (err) {
      setBonusError(
        err instanceof Error ? err.message : "Could not save the welcome bonus",
      );
    } finally {
      setBonusSaving(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await adminApi.referrals.saveSettings(settings);
      setSettings(saved);
      setMessage("Settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Refer & Earn">
      <div className="max-w-2xl">
        <AdminCard className="p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-white">
              Referral reward settings
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Members earn wallet points (1 point = ₹1) when someone they
              referred makes their first paid purchase. Points can be redeemed
              on package purchases and store orders.
            </p>
          </div>
          {loading ? (
            <div className="text-sm text-slate-500 py-6">Loading…</div>
          ) : !settings ? (
            <div className="text-sm text-red-400 py-6">
              {error ?? "Could not load referral settings"}
            </div>
          ) : (
            <form onSubmit={save} className="space-y-5">
              <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-white">
                    Program active
                  </div>
                  <div className="text-xs text-slate-500">
                    When off, no new referral rewards are credited (existing
                    points stay redeemable).
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.isActive}
                  onChange={(e) =>
                    setSettings({ ...settings, isActive: e.target.checked })
                  }
                  className="h-5 w-5 accent-lime-500"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">
                  Reward type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      {
                        value: "fixed",
                        title: "Fixed amount",
                        desc: "A set number of points per successful referral",
                      },
                      {
                        value: "percent",
                        title: "Percentage",
                        desc: "A % of the referred member's first purchase",
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setSettings({ ...settings, rewardType: opt.value })
                      }
                      className={`text-left rounded-lg border px-4 py-3 transition ${
                        settings.rewardType === opt.value
                          ? "border-lime-500 bg-lime-500/10"
                          : "border-slate-700 bg-slate-800/60 hover:border-slate-500"
                      }`}
                    >
                      <div className="text-sm font-medium text-white flex items-center gap-2">
                        <Gift className="h-4 w-4 text-lime-400" />
                        {opt.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1.5">
                  {settings.rewardType === "percent"
                    ? "Reward percentage (% of first purchase)"
                    : "Reward amount (points, 1 point = ₹1)"}
                </label>
                <input
                  type="number"
                  min={0}
                  max={settings.rewardType === "percent" ? 100 : undefined}
                  value={settings.rewardValue}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      rewardValue: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className={inputCls}
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  {settings.rewardType === "percent"
                    ? `Example: at ${settings.rewardValue}%, a ₹10,000 first purchase earns the referrer ${Math.round((10000 * settings.rewardValue) / 100)} points.`
                    : `Every successful referral earns the referrer ${settings.rewardValue} points (₹${settings.rewardValue}).`}
                </p>
              </div>

              {message && <div className="text-sm text-lime-400">{message}</div>}
              {error && <div className="text-sm text-red-400">{error}</div>}

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-400 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save settings"}
              </button>
            </form>
          )}
        </AdminCard>

        <AdminCard className="p-6 mt-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-white">
              Welcome bonus (new app installs)
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Points credited automatically the first time a new member signs
              up in the app or website (1 point = ₹1). They can redeem these on
              store orders, membership packages, and PT plans. Set 0 to turn
              the bonus off.
            </p>
          </div>
          {bonusPoints === null ? (
            <div className="text-sm text-slate-500 py-2">
              {bonusError ?? "Loading…"}
            </div>
          ) : (
            <form onSubmit={saveBonus} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">
                  Bonus points per new member
                </label>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  value={bonusPoints}
                  onChange={(e) =>
                    setBonusPoints(Math.max(0, Number(e.target.value) || 0))
                  }
                  className={inputCls}
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  {bonusPoints > 0
                    ? `Every new member starts with ${bonusPoints} points (₹${bonusPoints}) in their wallet.`
                    : "Welcome bonus is off — new members start with 0 points."}
                </p>
              </div>
              {bonusMessage && (
                <div className="text-sm text-lime-400">{bonusMessage}</div>
              )}
              {bonusError && bonusPoints !== null && (
                <div className="text-sm text-red-400">{bonusError}</div>
              )}
              <button
                type="submit"
                disabled={bonusSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-lime-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-400 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {bonusSaving ? "Saving…" : "Save welcome bonus"}
              </button>
            </form>
          )}
        </AdminCard>
      </div>
    </AdminLayout>
  );
}
