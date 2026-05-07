import { useCallback, useEffect, useState } from "react";
import { BellRing, Plus, ChevronRight, Globe, Palette, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { repairText } from "@/lib/repairText";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type AdminMachineOption = {
  id: string;
  code: string;
  nom: string;
};

type MachineRecipientPreview = {
  machine_id: string;
  machine_code: string;
  machine_name: string;
  machine_users: Array<{
    id: string;
    full_name: string;
    email: string;
  }>;
  configured: {
    manager_email?: string | null;
    technician_email?: string | null;
  };
  recipients: Array<{
    email: string;
    sources: string[];
    contact_names?: string[];
  }>;
};

export function AdminPage() {
  const { t, lang, setLang, theme, setTheme } = useApp();
  const {
    allUsers,
    currentUser,
    approveUser,
    rejectUser,
    deleteUser,
    reassignUserMachine,
    refreshUsers,
  } = useAuth();
  const navigate = useNavigate();

  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  const formatAssignedMachine = (
    user: { machineId?: string; machineCode?: string; machineName?: string },
    allLabel: string,
  ) => {
    if (!user.machineId) return allLabel;
    const label = [user.machineCode, user.machineName].filter(Boolean).join(" - ");
    return label || user.machineId;
  };

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
  const [machineOptions, setMachineOptions] = useState<AdminMachineOption[]>([]);
  const [recipientPreview, setRecipientPreview] = useState<MachineRecipientPreview[]>([]);
  const [machineDrafts, setMachineDrafts] = useState<Record<string, string>>({});
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const loadAdminContext = useCallback(async () => {
    if (!(currentUser?.role === "admin" && currentUser.status === "approved")) {
      return;
    }

    try {
      const [machinesData, previewData] = await Promise.all([
        apiFetch<AdminMachineOption[]>("/auth/machines"),
        apiFetch<MachineRecipientPreview[]>("/seuils/recipients-preview"),
      ]);
      setMachineOptions(machinesData);
      setRecipientPreview(previewData);
    } catch (error) {
      console.error(error);
      toast.error(
        repairText(
          lang === "fr"
            ? "Impossible de charger le rattachement machine et l'aperçu des destinataires."
            : lang === "en"
              ? "Could not load machine assignment and recipient preview."
              : "تعذر تحميل ربط الآلات ومعاينة المستلمين.",
        ),
      );
    }
  }, [currentUser?.role, currentUser?.status, lang]);

  useEffect(() => {
    if (currentUser?.role === "admin" && currentUser.status === "approved") {
      void refreshUsers();
      void loadAdminContext();
    }
  }, [currentUser?.role, currentUser?.status, loadAdminContext, refreshUsers]);

  const handleReassignMachine = async (userId: string, userName: string, currentMachineId?: string) => {
    const nextMachineId = machineDrafts[userId] ?? currentMachineId ?? "";
    if (!nextMachineId) {
      toast.error(l(
        "Choisissez d'abord une machine.",
        "Choose a machine first.",
        "اختر آلة أولاً.",
      ));
      return;
    }

    if (nextMachineId === currentMachineId) {
      toast.message(l(
        "Cette machine est déjà affectée à cet utilisateur.",
        "This machine is already assigned to this user.",
        "هذه الآلة مرتبطة بالفعل بهذا المستخدم.",
      ));
      return;
    }

    try {
      setUpdatingUserId(userId);
      await reassignUserMachine(userId, nextMachineId);
      await loadAdminContext();
      toast.success(l(
        `Machine mise à jour pour ${userName}.`,
        `Machine updated for ${userName}.`,
        `تم تحديث الآلة للمستخدم ${userName}.`,
      ));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : l("Erreur lors du changement de machine.", "Error while updating machine.", "حدث خطأ أثناء تحديث الآلة."),
      );
    } finally {
      setUpdatingUserId(null);
    }
  };

  const SETTINGS = [
    { icon: <Globe className="w-5 h-5" />, title: t("settings.language"), sub: `${t("settings.french")} / ${t("settings.english")} / ${t("settings.arabic")}`, action: "lang" },
    { icon: <Palette className="w-5 h-5" />, title: t("settings.theme"), sub: `${t("settings.dark")} / ${t("settings.light")}`, action: "theme" },
  ];

  const sourceLabel = (source: string) => {
    switch (source) {
      case "admin":
        return l("Admin", "Admin", "مدير");
      case "machine_user":
        return l("Utilisateur machine", "Machine user", "مستخدم الآلة");
      case "manager_email":
        return l("Responsable seuils", "Configured manager", "مسؤول العتبات");
      case "technician_email":
        return l("Technicien seuils", "Configured technician", "فني العتبات");
      default:
        return source;
    }
  };

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
                          <span>{formatAssignedMachine(user, l("Toutes les machines", "All machines", "Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¢Ù„Ø§Øª"))}</span>
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
              <button onClick={() => navigate("/signup?mode=admin-create")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground">
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
                        <td className="px-5 py-3 text-muted-foreground">
                          <div className="space-y-2">
                            <div>{formatAssignedMachine(user, l("Toutes", "All", "الكل"))}</div>
                            {user.role === "user" ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={machineDrafts[user.id] ?? user.machineId ?? ""}
                                  onChange={(event) =>
                                    setMachineDrafts((current) => ({
                                      ...current,
                                      [user.id]: event.target.value,
                                    }))
                                  }
                                  className="h-8 min-w-[190px] rounded-md border border-border bg-surface-3 px-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                                >
                                  <option value="">{l("Choisir une machine", "Choose a machine", "اختر آلة")}</option>
                                  {machineOptions.map((machine) => (
                                    <option key={machine.id} value={machine.id}>
                                      {machine.code} - {machine.nom}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={
                                    updatingUserId === user.id ||
                                    !((machineDrafts[user.id] ?? user.machineId) || "") ||
                                    (machineDrafts[user.id] ?? user.machineId) === user.machineId
                                  }
                                  onClick={() => handleReassignMachine(user.id, user.fullName, user.machineId)}
                                  className={`h-8 rounded-md px-3 text-xs font-semibold transition-colors ${
                                    updatingUserId === user.id ||
                                    !((machineDrafts[user.id] ?? user.machineId) || "") ||
                                    (machineDrafts[user.id] ?? user.machineId) === user.machineId
                                      ? "cursor-not-allowed border border-border bg-muted text-muted-foreground opacity-60"
                                      : "border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
                                  }`}
                                >
                                  {updatingUserId === user.id
                                    ? l("Mise à jour...", "Updating...", "جارٍ التحديث...")
                                    : l("Affecter", "Assign", "ربط")}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
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
          <section>
            <div className="flex items-center gap-2 mb-4">
              <BellRing className="w-5 h-5 text-primary" />
              <div>
                <h2 className="section-title">{l("Destinataires des alertes critiques", "Critical alert recipients", "مستلمو التنبيهات الحرجة")}</h2>
                <p className="text-sm text-muted-foreground">
                  {l(
                    "Aperçu machine par machine des emails notifiés au prochain replay critique ou à la prochaine alerte live.",
                    "Machine-by-machine preview of the emails notified on the next critical replay or live alert.",
                    "معاينة حسب كل آلة لرسائل البريد التي ستتلقى الإشعار عند إعادة التشغيل الحرجة التالية أو التنبيه الحي التالي.",
                  )}
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {recipientPreview.map((machine) => (
                <div key={machine.machine_id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-foreground">{machine.machine_code}</div>
                      <div className="text-xs text-muted-foreground">{machine.machine_name}</div>
                    </div>
                    <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[0.68rem] font-semibold text-foreground">
                      {machine.recipients.length} {l("destinataire(s)", "recipient(s)", "مستلم/مستلمون")}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {machine.recipients.length > 0 ? machine.recipients.map((recipient) => (
                      <div key={`${machine.machine_id}-${recipient.email}`} className="rounded-xl border border-border bg-surface-3 px-3 py-2.5">
                        <div className="text-sm font-medium text-foreground">{recipient.email}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {recipient.sources.map((source) => (
                            <span key={`${recipient.email}-${source}`} className="rounded-full bg-card px-2 py-0.5 text-[0.66rem] font-semibold text-muted-foreground">
                              {sourceLabel(source)}
                            </span>
                          ))}
                        </div>
                        {recipient.contact_names && recipient.contact_names.length > 0 ? (
                          <div className="mt-2 text-[0.72rem] text-muted-foreground">
                            {recipient.contact_names.join(", ")}
                          </div>
                        ) : null}
                      </div>
                    )) : (
                      <div className="rounded-xl border border-border bg-surface-3 px-3 py-3 text-sm text-muted-foreground">
                        {l(
                          "Aucun destinataire valide pour cette machine.",
                          "No valid recipient for this machine.",
                          "لا يوجد مستلم صالح لهذه الآلة.",
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-xl border border-border bg-surface-3 px-3 py-3 text-xs text-muted-foreground">
                    {machine.machine_users.length > 0
                      ? l(
                          `Utilisateur(s) machine : ${machine.machine_users.map((user) => user.full_name || user.email).join(", ")}`,
                          `Machine user(s): ${machine.machine_users.map((user) => user.full_name || user.email).join(", ")}`,
                          `مستخدمو الآلة: ${machine.machine_users.map((user) => user.full_name || user.email).join(", ")}`,
                        )
                      : l(
                          "Aucun utilisateur approuvé n'est rattaché à cette machine : seuls les admins et emails configurés seront notifiés.",
                          "No approved user is linked to this machine: only admins and configured emails will be notified.",
                          "لا يوجد مستخدم معتمد مرتبط بهذه الآلة: سيتم إشعار المدراء وعناوين البريد المهيأة فقط.",
                        )}
                  </div>
                </div>
              ))}
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
