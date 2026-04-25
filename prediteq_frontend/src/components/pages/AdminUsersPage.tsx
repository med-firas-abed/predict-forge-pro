import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { UserCheck, UserX, Users } from "lucide-react";

export function AdminUsersPage() {
  const { allUsers, currentUser, approveUser, rejectUser } = useAuth();

  const pending = allUsers.filter(u => u.status === "pending");
  const approved = allUsers.filter(u => u.status === "approved");

  const getMachineName = (user: { machineId?: string; machineCode?: string }) => {
    if (!user.machineId) return "Toutes les machines";
    return user.machineCode || user.machineId;
  };

  return (
    <div className="space-y-8">
      {/* Pending accounts */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="section-title">Comptes en attente</h2>
        </div>

        {pending.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground">Aucune demande en attente.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(user => {
              const isSelf = currentUser?.id === user.id;
              return (
                <div key={user.id} className={`bg-card border border-border rounded-xl p-5 flex items-center justify-between ${isSelf ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm font-semibold text-foreground">{user.fullName}</span>
                      <span className={`text-[0.6rem] font-bold uppercase px-2 py-0.5 rounded ${user.role === 'admin' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted text-muted-foreground border border-border'}`}>
                        {user.role === "admin" ? "Administrateur" : "Utilisateur"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground space-x-4">
                      <span>{user.email}</span>
                      <span>{getMachineName(user)}</span>
                      <span>{new Date(user.createdAt).toLocaleDateString("fr-FR")}</span>
                    </div>
                    {isSelf && (
                      <p className="text-xs text-warning mt-1 font-medium">Votre propre compte — ne peut pas être auto-approuvé</p>
                    )}
                  </div>
                  {!isSelf && (
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={async () => { try { await approveUser(user.id); toast.success("Compte approuvé"); } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur lors de l'approbation"); } }}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-success/10 text-success border border-success/20 text-xs font-semibold hover:bg-success/20 transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Approuver
                      </button>
                      <button
                        onClick={async () => { try { await rejectUser(user.id); toast.error("Compte refusé"); } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur lors du rejet"); } }}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 text-xs font-semibold hover:bg-destructive/20 transition-colors"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        Rejeter
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
        <div className="flex items-center gap-2 mb-4">
          <UserCheck className="w-5 h-5 text-success" />
          <h2 className="section-title">Comptes actifs</h2>
        </div>
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nom</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rôle</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Machine</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Approuvé le</th>
              </tr>
            </thead>
            <tbody>
              {approved.map(user => (
                <tr key={user.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-foreground font-medium">{user.fullName}</td>
                  <td className="px-5 py-3 text-muted-foreground">{user.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[0.6rem] font-bold uppercase px-2 py-0.5 rounded ${user.role === 'admin' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted text-muted-foreground border border-border'}`}>
                      {user.role === "admin" ? "Admin" : "Utilisateur"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{getMachineName(user)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{user.approvedAt ? new Date(user.approvedAt).toLocaleDateString("fr-FR") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
