import { useEffect, useState } from "react";
import { Plus, ChevronRight, Globe, Palette, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { repairText } from "@/lib/repairText";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function AdminPage() {
  const { t, lang, setLang, theme, setTheme } = useApp();
  const { allUsers, currentUser, approveUser, rejectUser, deleteUser, refreshUsers } = useAuth();
  const navigate = useNavigate();

  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  // Combien d'admins approuvés restent ? Sert à griser le bouton "Supprimer"
  // pour le DERNIER admin restant (impossible de tout supprimer côté UI, et
  // côté backend l'endpoint répondrait 409 de toute façon — voir auth.py).
  const approvedAdminCount = allUsers.filter(
    u => u.role === "admin" && u.status === "approved",
  ).length;

  // Wrapper avec confirmation native — évite les suppressions accidentelles.
  // (Pas de modal personnalisée pour rester simple ; la confirm() est suffisante
  // pour une action peu fréquente et critique.)
  const handleDelete = async (userId: string, userName: string, userRole: string, userStatus: string) => {
    const isLastAdmin = userRole === "admin" && userStatus === "approved" && approvedAdminCount <= 1;
    if (isLastAdmin) {
      toast.error(l(
        "Impossible de supprimer le dernier administrateur.",
        "Cannot delete the last administrator.",
        "لا يمكن حذف آخر مسؤول.",
      ));
      return;
    }
    const confirmed = window.confirm(
      l(
        `Supprimer définitivement ${userName} ? Cette action est irréversible.`,
        `Permanently delete ${userName}? This action cannot be undone.`,
        `حذف ${userName} نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.`,
      ),
    );
    if (!confirmed) return;
    try {
      await deleteUser(userId);
      toast.success(l("Compte supprimé", "Account deleted", "تم حذف الحساب"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : l("Erreur lors de la suppression", "Error during deletion", "خطأ أثناء الحذف"));
    }
  };

  const ADMIN_TABS = [
    { id: "comptes", label: l("Gestion des comptes", "Account Management", "إدارة الحسابات") },
    { id: "parametres", label: l("Paramètres", "Settings", "الإعدادات") },
  ];

  const [activeTab, setActiveTab] = useState("comptes");

  useEffect(() => {
    if (currentUser?.role === "admin" && currentUser.status === "approved") {
      void refreshUsers();
    }
  }, [currentUser?.role, currentUser?.status, refreshUsers]);

  const SETTINGS = [
    { icon: <Globe className="w-5 h-5" />, title: t("settings.language"), sub: `${t("settings.french")} / ${t("settings.english")} / ${t("settings.arabic")}`, action: "lang" },
    { icon: <Palette className="w-5 h-5" />, title: t("settings.theme"), sub: `${t("settings.dark")} / ${t("settings.light")}`, action: "theme" },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1.5 mb-6">
        {ADMIN_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium border transition-all ${
              activeTab === tab.id
                ? "bg-primary/10 text-primary border-primary/30 font-semibold"
                : "text-secondary-foreground border-border hover:bg-surface-3 hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Account Management panel */}
      {activeTab === "comptes" && (
        <div className="space-y-8">
          {/* Pending accounts */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="section-title">{l("Comptes en attente", "Pending Accounts", "حسابات معلقة")}</h2>
            </div>
            {allUsers.filter(u => u.status === "pending").length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 text-center">
                <p className="text-sm text-muted-foreground">{l("Aucune demande en attente.", "No pending requests.", "لا توجد طلبات معلقة.")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allUsers.filter(u => u.status === "pending").map(user => {
                  const isSelf = currentUser?.id === user.id;
                  const getMachineName = (u: { machineId?: string; machineCode?: string }) => u.machineId ? (u.machineCode || u.machineId) : l("Toutes les machines", "All machines", "جميع الآلات");
                  return (
                    <div key={user.id} className={`bg-card border border-border rounded-xl p-5 flex items-center justify-between ${isSelf ? 'opacity-50' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-sm font-semibold text-foreground">{user.fullName}</span>
                          <span className={`text-[0.6rem] font-bold uppercase px-2 py-0.5 rounded ${user.role === 'admin' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted text-muted-foreground border border-border'}`}>
                            {user.role === "admin" ? l("Administrateur", "Administrator", "مدير") : l("Utilisateur", "User", "مستخدم")}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground space-x-4">
                          <span>{user.email}</span>
                          <span>{getMachineName(user)}</span>
                          <span>{new Date(user.createdAt).toLocaleDateString("fr-FR")}</span>
                        </div>
                        {isSelf && (
                          <p className="text-xs text-warning mt-1 font-medium">{l("Votre propre compte — ne peut pas être auto-approuvé", "Your own account — cannot self-approve", "حسابك الخاص — لا يمكن الموافقة الذاتية")}</p>
                        )}
                      </div>
                      {!isSelf && (
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={async () => { await approveUser(user.id); toast.success(l("Compte approuvé", "Account approved", "تمت الموافقة على الحساب")); }}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-success/10 text-success border border-success/20 text-xs font-semibold hover:bg-success/20 transition-colors"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            {l("Approuver", "Approve", "موافقة")}
                          </button>
                          <button
                            onClick={async () => { await rejectUser(user.id); toast.error(l("Compte refusé", "Account rejected", "تم رفض الحساب")); }}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 text-xs font-semibold hover:bg-destructive/20 transition-colors"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            {l("Rejeter", "Reject", "رفض")}
                          </button>
                          {/* Suppression définitive d'une demande en attente —
                              parfois utile pour purger un compte de test. */}
                          <button
                            onClick={() => handleDelete(user.id, user.fullName, user.role, user.status)}
                            title={l("Supprimer définitivement", "Delete permanently", "حذف نهائي")}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-destructive/15 text-destructive border border-destructive/30 text-xs font-semibold hover:bg-destructive/25 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {l("Supprimer", "Delete", "حذف")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Active accounts */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-success" />
                <h2 className="section-title">{l("Comptes actifs", "Active Accounts", "الحسابات النشطة")}</h2>
              </div>
              <button onClick={() => navigate("/signup")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground">
                <Plus className="w-3.5 h-3.5" /> {l("Ajouter utilisateur", "Add User", "إضافة مستخدم")}
              </button>
            </div>
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("table.name")}</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("table.email")}</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("table.role")}</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Machine</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{l("Approuvé le", "Approved on", "تاريخ الموافقة")}</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{l("Actions", "Actions", "إجراءات")}</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.filter(u => u.status === "approved").map(user => {
                    const isSelf = currentUser?.id === user.id;
                    // Désactivé si :
                    //   (a) c'est le compte courant (anti-self-delete) ;
                    //   (b) c'est le dernier admin approuvé (anti-last-admin) — la
                    //       suppression serait également bloquée côté backend (409).
                    const isLastAdmin = user.role === "admin" && approvedAdminCount <= 1;
                    const disableDelete = isSelf || isLastAdmin;
                    const disabledReason = isSelf
                      ? l("Vous ne pouvez pas supprimer votre propre compte.", "You cannot delete your own account.", "لا يمكنك حذف حسابك الخاص.")
                      : isLastAdmin
                        ? l("Dernier administrateur — promouvez un autre admin avant.", "Last administrator — promote another admin first.", "آخر مسؤول — قم بترقية مسؤول آخر أولاً.")
                        : l("Supprimer définitivement", "Delete permanently", "حذف نهائي");
                    return (
                      <tr key={user.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-3 text-foreground font-medium">{user.fullName}</td>
                        <td className="px-5 py-3 text-muted-foreground">{user.email}</td>
                        <td className="px-5 py-3">
                          <span className={`text-[0.6rem] font-bold uppercase px-2 py-0.5 rounded ${user.role === 'admin' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted text-muted-foreground border border-border'}`}>
                            {user.role === "admin" ? "Admin" : l("Utilisateur", "User", "مستخدم")}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{user.machineId ? (user.machineCode || user.machineId) : l("Toutes", "All", "الكل")}</td>
                        <td className="px-5 py-3 text-muted-foreground">{user.approvedAt ? new Date(user.approvedAt).toLocaleDateString("fr-FR") : "—"}</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            disabled={disableDelete}
                            onClick={() => handleDelete(user.id, user.fullName, user.role, user.status)}
                            title={disabledReason}
                            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold transition-colors ${
                              disableDelete
                                ? "bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-60"
                                : "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20"
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {l("Supprimer", "Delete", "حذف")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Settings panel */}
      {activeTab === "parametres" && (
        <div className="space-y-2.5">
          {SETTINGS.map(s => (
            <div
              key={s.title}
              className="flex items-center bg-card border border-border rounded-lg px-5 py-4 cursor-pointer hover:border-primary/30 transition-colors group"
              onClick={() => {
                if (s.action === "lang") setLang(lang === "fr" ? "en" : lang === "en" ? "ar" : "fr");
                if (s.action === "theme") setTheme(theme === "dark" ? "light" : "dark");
              }}
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mr-4 flex-shrink-0">
                {s.icon}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">{s.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
              </div>
              {s.action === "lang" && <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-md mr-3">{lang === "fr" ? "Français" : lang === "en" ? "English" : "العربية"}</span>}
              {s.action === "theme" && <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-md mr-3">{theme === "dark" ? t("settings.dark") : t("settings.light")}</span>}
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
