import { toast } from "sonner";
import { Trash2, UserCheck, UserX, Users } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { getUiLang, getUiLocale, localize } from "@/lib/i18n";
import { getMachinePublicLabel } from "@/lib/machinePresentation";

export function AdminUsersPage() {
  const { allUsers, currentUser, approveUser, rejectUser, deleteUser } = useAuth();
  const lang = getUiLang();
  const locale = getUiLocale(lang);
  const l = (fr: string, en: string) => localize(lang, fr, en);

  const pending = allUsers.filter((user) => user.status === "pending");
  const approved = allUsers.filter((user) => user.status === "approved");
  const approvedAdminCount = approved.filter((user) => user.role === "admin").length;

  const getMachineName = (user: { machineId?: string; machineCode?: string; machineName?: string }) => {
    if (!user.machineId && !user.machineCode && !user.machineName) {
      return l("Toutes les machines", "All machines");
    }
    return getMachinePublicLabel({
      id: user.machineId,
      code: user.machineCode,
      name: user.machineName,
    });
  };

  const handleDelete = async (
    userId: string,
    userName: string,
    userRole: string,
    userStatus: string,
  ) => {
    const isLastAdmin = userRole === "admin" && userStatus === "approved" && approvedAdminCount <= 1;
    if (isLastAdmin) {
      toast.error(l("Impossible de supprimer le dernier administrateur.", "Cannot delete the last administrator."));
      return;
    }
    if (!window.confirm(l(`Supprimer definitivement ${userName} ? Action irreversible.`, `Permanently delete ${userName}? This action is irreversible.`))) {
      return;
    }
    try {
      await deleteUser(userId);
      toast.success(l("Compte supprimé", "Account deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : l("Erreur lors de la suppression", "Error while deleting the account"));
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="section-title">{l("Comptes en attente", "Pending Accounts")}</h2>
        </div>

        {pending.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground">{l("Aucune demande en attente.", "No pending requests.")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((user) => {
              const isSelf = currentUser?.id === user.id;
              return (
                <div
                  key={user.id}
                  className={`bg-card border border-border rounded-xl p-5 flex items-center justify-between ${isSelf ? "opacity-50" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm font-semibold text-foreground">{user.fullName}</span>
                      <span
                        className={`text-[0.6rem] font-bold uppercase px-2 py-0.5 rounded ${
                          user.role === "admin"
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        {user.role === "admin" ? l("Administrateur", "Administrator") : l("Utilisateur", "User")}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground space-x-4">
                      <span>{user.email}</span>
                      <span>{getMachineName(user)}</span>
                      <span>{new Date(user.createdAt).toLocaleDateString(locale)}</span>
                    </div>
                    {isSelf && (
                      <p className="text-xs text-warning mt-1 font-medium">
                        {l("Votre propre compte ne peut pas etre auto-approuve", "Your own account cannot self-approve")}
                      </p>
                    )}
                  </div>
                  {!isSelf && (
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={async () => {
                          try {
                            await approveUser(user.id);
                            toast.success(l("Compte approuvé", "Account approved"));
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : l("Erreur lors de l'approbation", "Error while approving the account"));
                          }
                        }}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-success/10 text-success border border-success/20 text-xs font-semibold hover:bg-success/20 transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        {l("Approuver", "Approve")}
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await rejectUser(user.id);
                            toast.error(l("Compte refusé", "Account rejected"));
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : l("Erreur lors du rejet", "Error while rejecting the account"));
                          }
                        }}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 text-xs font-semibold hover:bg-destructive/20 transition-colors"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        {l("Rejeter", "Reject")}
                      </button>
                      <button
                        onClick={() => handleDelete(user.id, user.fullName, user.role, user.status)}
                        title={l("Supprimer definitivement", "Delete permanently")}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-destructive/15 text-destructive border border-destructive/30 text-xs font-semibold hover:bg-destructive/25 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {l("Supprimer", "Delete")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <UserCheck className="w-5 h-5 text-success" />
          <h2 className="section-title">{l("Comptes actifs", "Active Accounts")}</h2>
        </div>
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {l("Nom", "Name")}
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Email
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {l("Role", "Role")}
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Machine
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {l("Approuve le", "Approved on")}
                </th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {l("Actions", "Actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {approved.map((user) => {
                const isSelf = currentUser?.id === user.id;
                const isLastAdmin = user.role === "admin" && approvedAdminCount <= 1;
                const disableDelete = isSelf || isLastAdmin;
                const reason = isSelf
                  ? l("Vous ne pouvez pas supprimer votre propre compte.", "You cannot delete your own account.")
                  : isLastAdmin
                    ? l("Dernier administrateur : promouvez un autre admin avant.", "Last administrator: promote another admin first.")
                    : l("Supprimer definitivement", "Delete permanently");

                return (
                  <tr key={user.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 text-foreground font-medium">{user.fullName}</td>
                    <td className="px-5 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-[0.6rem] font-bold uppercase px-2 py-0.5 rounded ${
                          user.role === "admin"
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        {user.role === "admin" ? "Admin" : l("Utilisateur", "User")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{getMachineName(user)}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {user.approvedAt ? new Date(user.approvedAt).toLocaleDateString(locale) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        disabled={disableDelete}
                        onClick={() => handleDelete(user.id, user.fullName, user.role, user.status)}
                        title={reason}
                        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold transition-colors ${
                          disableDelete
                            ? "bg-muted text-muted-foreground border border-border cursor-not-allowed opacity-60"
                            : "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20"
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {l("Supprimer", "Delete")}
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
  );
}
