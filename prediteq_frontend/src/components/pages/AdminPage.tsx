import { useCallback, useEffect, useState } from "react";
import { BellRing, Plus, ChevronRight, Globe, Palette, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { getMachinePublicLabel } from "@/lib/machinePresentation";
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
  const dateLocale = lang === "en" ? "en-US" : "fr-FR";

  const l = (fr: string, en: string, ar: string) =>
    repairText(lang === "fr" ? fr : lang === "en" ? en : ar);

  const formatAssignedMachine = (
    user: { machineId?: string; machineCode?: string; machineName?: string },
    allLabel: string,
  ) => {
    if (!user.machineId && !user.machineCode && !user.machineName) return allLabel;
    return getMachinePublicLabel({
      id: user.machineId,
      code: user.machineCode,
      name: user.machineName,
    });
  };

  // Count approved admins so the UI can block deleting the last one.
  // The backend also guards this path and would return 409.
  const approvedAdminCount = allUsers.filter(
    u => u.role === "admin" && u.status === "approved",
  ).length;

  // Wrapper avec confirmation native â€” Ã©vite les suppressions accidentelles.
  // (Pas de modal personnalisÃ©e pour rester simple ; la confirm() est suffisante
  // pour une action peu frÃ©quente et critique.)
  const handleDelete = async (userId: string, userName: string, userRole: string, userStatus: string) => {
    const isLastAdmin = userRole === "admin" && userStatus === "approved" && approvedAdminCount <= 1;
    if (isLastAdmin) {
      toast.error(l(
        "Impossible de supprimer le dernier administrateur.",
        "Cannot delete the last administrator.",
        "Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø­Ø°Ù Ø¢Ø®Ø± Ù…Ø³Ø¤ÙˆÙ„.",
      ));
      return;
    }
    const confirmed = window.confirm(
      l(
        `Supprimer dÃ©finitivement ${userName} ? Cette action est irrÃ©versible.`,
        `Permanently delete ${userName}? This action cannot be undone.`,
        `Ø­Ø°Ù ${userName} Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹ØŸ Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡ Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø¹Ù†Ù‡.`,
      ),
    );
    if (!confirmed) return;
    try {
      await deleteUser(userId);
      await loadAdminContext();
      toast.success(l("Compte supprimÃ©", "Account deleted", "ØªÙ… Ø­Ø°Ù Ø§Ù„Ø­Ø³Ø§Ø¨"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : l("Erreur lors de la suppression", "Error during deletion", "Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø­Ø°Ù"));
    }
  };

  const ADMIN_TABS = [
    { id: "comptes", label: l("Gestion des comptes", "Account Management", "Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª") },
    { id: "parametres", label: l("ParamÃ¨tres", "Settings", "Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª") },
  ];

  const [activeTab, setActiveTab] = useState("comptes");
  const [machineOptions, setMachineOptions] = useState<AdminMachineOption[]>([]);
  const [recipientPreview, setRecipientPreview] = useState<MachineRecipientPreview[]>([]);
  const [machineDrafts, setMachineDrafts] = useState<Record<string, string>>({});
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [reviewingUserId, setReviewingUserId] = useState<string | null>(null);

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
            ? "Impossible de charger le rattachement machine et l'aperÃ§u des destinataires."
            : lang === "en"
              ? "Could not load machine assignment and recipient preview."
              : "ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø±Ø¨Ø· Ø§Ù„Ø¢Ù„Ø§Øª ÙˆÙ…Ø¹Ø§ÙŠÙ†Ø© Ø§Ù„Ù…Ø³ØªÙ„Ù…ÙŠÙ†.",
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
        "Ø§Ø®ØªØ± Ø¢Ù„Ø© Ø£ÙˆÙ„Ø§Ù‹.",
      ));
      return;
    }

    if (nextMachineId === currentMachineId) {
      toast.message(l(
        "Cette machine est dÃ©jÃ  affectÃ©e Ã  cet utilisateur.",
        "This machine is already assigned to this user.",
        "Ù‡Ø°Ù‡ Ø§Ù„Ø¢Ù„Ø© Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ø§Ù„ÙØ¹Ù„ Ø¨Ù‡Ø°Ø§ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù….",
      ));
      return;
    }

    try {
      setUpdatingUserId(userId);
      await reassignUserMachine(userId, nextMachineId);
      await loadAdminContext();
      toast.success(l(
        `Machine mise a jour pour ${userName}.`,
        `Machine updated for ${userName}.`,
        `ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¢Ù„Ø© Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù… ${userName}.`,
      ));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : l("Erreur lors du changement de machine.", "Error while updating machine.", "Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¢Ù„Ø©."),
      );
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleReviewUser = async (userId: string, action: "approve" | "reject") => {
    try {
      setReviewingUserId(userId);
      if (action === "approve") {
        await approveUser(userId);
      } else {
        await rejectUser(userId);
      }
      await loadAdminContext();
      toast.success(
        action === "approve"
          ? l("Compte approuvÃ©", "Account approved", "ØªÙ…Øª Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø­Ø³Ø§Ø¨")
          : l("Compte refusÃ©", "Account rejected", "ØªÙ… Ø±ÙØ¶ Ø§Ù„Ø­Ø³Ø§Ø¨"),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : action === "approve"
            ? l("Erreur lors de l'approbation", "Approval failed", "Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø©.")
            : l("Erreur lors du refus", "Rejection failed", "Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø±ÙØ¶."),
      );
    } finally {
      setReviewingUserId(null);
    }
  };

  const SETTINGS = [
    { icon: <Globe className="w-5 h-5" />, title: t("settings.language"), sub: `${t("settings.french")} / ${t("settings.english")}`, action: "lang" },
    { icon: <Palette className="w-5 h-5" />, title: t("settings.theme"), sub: `${t("settings.dark")} / ${t("settings.light")}`, action: "theme" },
  ];

  const sourceLabel = (source: string) => {
    switch (source) {
      case "admin":
        return l("Admin", "Admin", "Ù…Ø¯ÙŠØ±");
      case "machine_user":
        return l("Utilisateur machine", "Machine user", "Ù…Ø³ØªØ®Ø¯Ù… Ø§Ù„Ø¢Ù„Ø©");
      case "manager_email":
        return l("Responsable seuils", "Configured manager", "Ù…Ø³Ø¤ÙˆÙ„ Ø§Ù„Ø¹ØªØ¨Ø§Øª");
      case "technician_email":
        return l("Technicien seuils", "Configured technician", "ÙÙ†ÙŠ Ø§Ù„Ø¹ØªØ¨Ø§Øª");
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
              <h2 className="section-title">{l("Comptes en attente", "Pending Accounts", "Ø­Ø³Ø§Ø¨Ø§Øª Ù…Ø¹Ù„Ù‚Ø©")}</h2>
            </div>
            {allUsers.filter(u => u.status === "pending").length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 text-center">
                <p className="text-sm text-muted-foreground">{l("Aucune demande en attente.", "No pending requests.", "Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø§Øª Ù…Ø¹Ù„Ù‚Ø©.")}</p>
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
                            {user.role === "admin" ? l("Administrateur", "Administrator", "Ù…Ø¯ÙŠØ±") : l("Utilisateur", "User", "Ù…Ø³ØªØ®Ø¯Ù…")}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground space-x-4">
                          <span>{user.email}</span>
                          <span>{formatAssignedMachine(user, l("Toutes les machines", "All machines", "Ã˜Â¬Ã™â€¦Ã™Å Ã˜Â¹ Ã˜Â§Ã™â€žÃ˜Â¢Ã™â€žÃ˜Â§Ã˜Âª"))}</span>
                          <span>{new Date(user.createdAt).toLocaleDateString(dateLocale)}</span>
                        </div>
                        {isSelf && (
                          <p className="text-xs text-warning mt-1 font-medium">{l("Votre propre compte â€” ne peut pas Ãªtre auto-approuvÃ©", "Your own account â€” cannot self-approve", "Ø­Ø³Ø§Ø¨Ùƒ Ø§Ù„Ø®Ø§Øµ â€” Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø§Ù„Ø°Ø§ØªÙŠØ©")}</p>
                        )}
                      </div>
                      {!isSelf && (
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => void handleReviewUser(user.id, "approve")}
                            disabled={reviewingUserId === user.id}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-success/10 text-success border border-success/20 text-xs font-semibold hover:bg-success/20 transition-colors"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            {reviewingUserId === user.id ? l("Traitement...", "Working...", "Ø¬Ø§Ø±Ù Ø§Ù„ØªÙ†ÙÙŠØ°...") : l("Approuver", "Approve", "Ù…ÙˆØ§ÙÙ‚Ø©")}
                          </button>
                          <button
                            onClick={() => void handleReviewUser(user.id, "reject")}
                            disabled={reviewingUserId === user.id}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 text-xs font-semibold hover:bg-destructive/20 transition-colors"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            {reviewingUserId === user.id ? l("Traitement...", "Working...", "Ø¬Ø§Ø±Ù Ø§Ù„ØªÙ†ÙÙŠØ°...") : l("Rejeter", "Reject", "Ø±ÙØ¶")}
                          </button>
                          {/* Suppression dÃ©finitive d'une demande en attente â€”
                              parfois utile pour purger un compte de test. */}
                          <button
                            onClick={() => handleDelete(user.id, user.fullName, user.role, user.status)}
                            title={l("Supprimer dÃ©finitivement", "Delete permanently", "Ø­Ø°Ù Ù†Ù‡Ø§Ø¦ÙŠ")}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-destructive/15 text-destructive border border-destructive/30 text-xs font-semibold hover:bg-destructive/25 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {l("Supprimer", "Delete", "Ø­Ø°Ù")}
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
                <h2 className="section-title">{l("Comptes actifs", "Active Accounts", "Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø©")}</h2>
              </div>
              <button onClick={() => navigate("/signup?mode=admin-create")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground">
                <Plus className="w-3.5 h-3.5" /> {l("Ajouter utilisateur", "Add User", "Ø¥Ø¶Ø§ÙØ© Ù…Ø³ØªØ®Ø¯Ù…")}
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
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{l("ApprouvÃ© le", "Approved on", "ØªØ§Ø±ÙŠØ® Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø©")}</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{l("Actions", "Actions", "Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª")}</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.filter(u => u.status === "approved").map(user => {
                    const isSelf = currentUser?.id === user.id;
                    // DÃ©sactivÃ© si :
                    //   (a) c'est le compte courant (anti-self-delete) ;
                    //   (b) c'est le dernier admin approuvÃ© (anti-last-admin) â€” la
                    //       suppression serait Ã©galement bloquÃ©e cÃ´tÃ© backend (409).
                    const isLastAdmin = user.role === "admin" && approvedAdminCount <= 1;
                    const disableDelete = isSelf || isLastAdmin;
                    const disabledReason = isSelf
                      ? l("Vous ne pouvez pas supprimer votre propre compte.", "You cannot delete your own account.", "Ù„Ø§ ÙŠÙ…ÙƒÙ†Ùƒ Ø­Ø°Ù Ø­Ø³Ø§Ø¨Ùƒ Ø§Ù„Ø®Ø§Øµ.")
                      : isLastAdmin
                        ? l("Dernier administrateur â€” promouvez un autre admin avant.", "Last administrator â€” promote another admin first.", "Ø¢Ø®Ø± Ù…Ø³Ø¤ÙˆÙ„ â€” Ù‚Ù… Ø¨ØªØ±Ù‚ÙŠØ© Ù…Ø³Ø¤ÙˆÙ„ Ø¢Ø®Ø± Ø£ÙˆÙ„Ø§Ù‹.")
                        : l("Supprimer dÃ©finitivement", "Delete permanently", "Ø­Ø°Ù Ù†Ù‡Ø§Ø¦ÙŠ");
                    return (
                      <tr key={user.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-3 text-foreground font-medium">{user.fullName}</td>
                        <td className="px-5 py-3 text-muted-foreground">{user.email}</td>
                        <td className="px-5 py-3">
                          <span className={`text-[0.6rem] font-bold uppercase px-2 py-0.5 rounded ${user.role === 'admin' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted text-muted-foreground border border-border'}`}>
                            {user.role === "admin" ? "Admin" : l("Utilisateur", "User", "Ù…Ø³ØªØ®Ø¯Ù…")}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          <div className="space-y-2">
                            <div>{formatAssignedMachine(user, l("Toutes", "All", "Ø§Ù„ÙƒÙ„"))}</div>
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
                                  <option value="">{l("Choisir une machine", "Choose a machine", "Ø§Ø®ØªØ± Ø¢Ù„Ø©")}</option>
                                  {machineOptions.map((machine) => (
                                    <option key={machine.id} value={machine.id}>
                                      {getMachinePublicLabel({ code: machine.code, name: machine.nom })}
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
                                    ? l("Mise Ã  jour...", "Updating...", "Ø¬Ø§Ø±Ù Ø§Ù„ØªØ­Ø¯ÙŠØ«...")
                                    : l("Affecter", "Assign", "Ø±Ø¨Ø·")}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{user.approvedAt ? new Date(user.approvedAt).toLocaleDateString(dateLocale) : "â€”"}</td>
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
                            {l("Supprimer", "Delete", "Ø­Ø°Ù")}
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
                <h2 className="section-title">{l("Destinataires des alertes critiques", "Critical alert recipients", "Ù…Ø³ØªÙ„Ù…Ùˆ Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡Ø§Øª Ø§Ù„Ø­Ø±Ø¬Ø©")}</h2>
                <p className="text-sm text-muted-foreground">
                  {l(
                    "Aperçu machine par machine des emails prévus lors du prochain cas critique ou de la prochaine alerte.",
                    "Machine-by-machine preview of the emails planned for the next critical case or alert.",
                    "Ù…Ø¹Ø§ÙŠÙ†Ø© Ø­Ø³Ø¨ ÙƒÙ„ Ø¢Ù„Ø© Ù„Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ù…ØªÙˆÙ‚Ø¹ Ø¹Ù†Ø¯ Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ø­Ø±Ø¬Ø© Ø§Ù„ØªØ§Ù„ÙŠØ© Ø£Ùˆ Ø§Ù„ØªÙ†Ø¨ÙŠÙ‡ Ø§Ù„ØªØ§Ù„ÙŠ.",
                  )}
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {recipientPreview.map((machine) => (
                <div key={machine.machine_id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        {getMachinePublicLabel({ code: machine.machine_code, name: machine.machine_name })}
                      </div>
                    </div>
                    <span className="rounded-full bg-surface-3 px-2.5 py-1 text-[0.68rem] font-semibold text-foreground">
                      {machine.recipients.length} {l("destinataire(s)", "recipient(s)", "Ù…Ø³ØªÙ„Ù…/Ù…Ø³ØªÙ„Ù…ÙˆÙ†")}
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
                          "Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…Ø³ØªÙ„Ù… ØµØ§Ù„Ø­ Ù„Ù‡Ø°Ù‡ Ø§Ù„Ø¢Ù„Ø©.",
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-xl border border-border bg-surface-3 px-3 py-3 text-xs text-muted-foreground">
                    {machine.machine_users.length > 0
                      ? l(
                          `Utilisateur(s) machine : ${machine.machine_users.map((user) => user.full_name || user.email).join(", ")}`,
                          `Machine user(s): ${machine.machine_users.map((user) => user.full_name || user.email).join(", ")}`,
                          `Ù…Ø³ØªØ®Ø¯Ù…Ùˆ Ø§Ù„Ø¢Ù„Ø©: ${machine.machine_users.map((user) => user.full_name || user.email).join(", ")}`,
                        )
                      : l(
                          "Aucun utilisateur approuvÃ© n'est rattachÃ© Ã  cette machine : seuls les admins et emails configurÃ©s seront notifiÃ©s.",
                          "No approved user is linked to this machine: only admins and configured emails will be notified.",
                          "Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…Ø³ØªØ®Ø¯Ù… Ù…Ø¹ØªÙ…Ø¯ Ù…Ø±ØªØ¨Ø· Ø¨Ù‡Ø°Ù‡ Ø§Ù„Ø¢Ù„Ø©: Ø³ÙŠØªÙ… Ø¥Ø´Ø¹Ø§Ø± Ø§Ù„Ù…Ø¯Ø±Ø§Ø¡ ÙˆØ¹Ù†Ø§ÙˆÙŠÙ† Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ù…Ù‡ÙŠØ£Ø© ÙÙ‚Ø·.",
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
                if (s.action === "lang") setLang(lang === "fr" ? "en" : "fr");
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
              {s.action === "lang" && <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-md mr-3">{lang === "fr" ? t("settings.french") : t("settings.english")}</span>}
              {s.action === "theme" && <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-md mr-3">{theme === "dark" ? t("settings.dark") : t("settings.light")}</span>}
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

