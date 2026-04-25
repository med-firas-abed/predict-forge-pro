import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Plus, X, Save, Pencil } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useGmaoTaches, TacheType, TacheStatut } from "@/hooks/useGmaoTaches";
import { useMachines } from "@/hooks/useMachines";
import { toast } from "sonner";

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface CalEvent {
  id: string;
  type: 'preventive' | 'corrective' | 'inspection';
  label: string;
  machine: string;
  technician: string;
  description: string;
  statut: string;
  date: string;
}

const TYPE_STYLES: Record<string, { dot: string; bg: string; text: string; labelKey: string }> = {
  preventive: { dot: 'bg-success', bg: 'bg-success/10', text: 'text-success', labelKey: 'cal.preventive' },
  corrective: { dot: 'bg-warning', bg: 'bg-warning/10', text: 'text-warning', labelKey: 'cal.corrective' },
  inspection: { dot: 'bg-primary', bg: 'bg-primary/10', text: 'text-primary', labelKey: 'cal.inspection' },
};

export function CalendarPage() {
  const { t, lang } = useApp();
  const { currentUser } = useAuth();
  const { taches, addTache, updateTache } = useGmaoTaches(currentUser?.machineId);
  const { machines } = useMachines(currentUser?.machineId);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [showSchedule, setShowSchedule] = useState(false);
  const [schTitle, setSchTitle] = useState("");
  const [schMachineId, setSchMachineId] = useState("");
  const [schType, setSchType] = useState<TacheType>("preventive");
  const [schDate, setSchDate] = useState("");
  const [schTechnician, setSchTechnician] = useState("");
  const [detailEvent, setDetailEvent] = useState<CalEvent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTech, setEditTech] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatut, setEditStatut] = useState<TacheStatut>("planifiee");
  const [editType, setEditType] = useState<TacheType>("preventive");

  const openDetail = (ev: CalEvent) => {
    setDetailEvent(ev);
    setEditing(false);
    setEditTech(ev.technician === "—" ? "" : ev.technician);
    setEditDate(ev.date);
    setEditStatut(ev.statut as TacheStatut);
    setEditType(ev.type);
  };

  const saveEdit = () => {
    if (!detailEvent) return;
    updateTache.mutate({
      id: detailEvent.id,
      technicien: editTech || undefined,
      date_planifiee: editDate || undefined,
      statut: editStatut,
      type: editType,
    });
    setDetailEvent(null);
    setEditing(false);
    toast.success(t("cal.updated"));
  };

  const handleSchedule = () => {
    if (!schTitle.trim() || !schMachineId) return;
    addTache.mutate({
      machine_id: schMachineId,
      titre: schTitle,
      type: schType,
      date_planifiee: schDate || undefined,
      technicien: schTechnician || undefined,
    });
    setShowSchedule(false);
    setSchTitle(""); setSchType("preventive"); setSchDate(""); setSchTechnician("");
    toast.success(t("cal.schedule"));
  };

  // Build CAL_EVENTS from Supabase taches
  const CAL_EVENTS = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    taches.forEach(tache => {
      if (!tache.datePlanifiee) return;
      const dateKey = tache.datePlanifiee.slice(0, 10);
      const event: CalEvent = {
        id: tache.id,
        type: tache.type as CalEvent["type"],
        label: tache.titre,
        machine: tache.machineCode,
        technician: tache.technicien || "—",
        description: tache.description || "",
        statut: tache.statut,
        date: dateKey,
      };
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(event);
    });
    return map;
  }, [taches]);

  const DAY_KEYS = ["cal.mon", "cal.tue", "cal.wed", "cal.thu", "cal.fri", "cal.sat", "cal.sun"];

  const changeMonth = (dir: number) => {
    let m = month + dir;
    let y = year;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setMonth(m);
    setYear(y);
  };

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    let startDow = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    const result: { day: number; isOther: boolean; isToday: boolean; events: CalEvent[] }[] = [];

    for (let i = startDow - 1; i >= 0; i--) {
      result.push({ day: prevDays - i, isOther: true, isToday: false, events: [] });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const events = CAL_EVENTS[dateKey] || [];
      result.push({ day: d, isOther: false, isToday: isCurrentMonth && d === today.getDate(), events });
    }
    const rem = (7 - result.length % 7) % 7;
    for (let i = 1; i <= rem; i++) {
      result.push({ day: i, isOther: true, isToday: false, events: [] });
    }
    return result;
  }, [year, month, CAL_EVENTS]);

  // Collect upcoming interventions (today + future only)
  const upcomingEvents = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const all: { date: string; event: CalEvent }[] = [];
    Object.entries(CAL_EVENTS).forEach(([date, evts]) => {
      if (date >= todayStr) {
        evts.forEach(e => all.push({ date, event: e }));
      }
    });
    return all.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }, [CAL_EVENTS]);

  const months = Array.from({ length: 12 }, (_, i) => t(`month.${i}`));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="section-title">{t("cal.planning")}</div>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="w-9 h-9 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-secondary-foreground hover:bg-border-subtle hover:text-foreground transition-all">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-foreground px-3 min-w-[150px] text-center">{months[month]} {year}</span>
          <button onClick={() => changeMonth(1)} className="w-9 h-9 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-secondary-foreground hover:bg-border-subtle hover:text-foreground transition-all">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => { setSchMachineId(machines[0]?.uuid || machines[0]?.id || ""); setSchDate(`${year}-${String(month + 1).padStart(2, '0')}-01`); setShowSchedule(true); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground ml-2">
            <Plus className="w-3.5 h-3.5" /> {t("cal.schedule")}
          </button>
        </div>
      </div>

      {/* Schedule Modal */}
      {showSchedule && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowSchedule(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-[480px] max-w-[95vw] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="section-title">{t("cal.schedule")}</div>
              <button onClick={() => setShowSchedule(false)} className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <input value={schTitle} onChange={e => setSchTitle(e.target.value)} placeholder={t("maint.newTask")} className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <select value={schMachineId} onChange={e => setSchMachineId(e.target.value)} className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                {machines.map(m => <option key={m.id} value={m.uuid || m.id}>{m.id} — {m.name}</option>)}
              </select>
              <select value={schType} onChange={e => setSchType(e.target.value as TacheType)} className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="preventive">{t("cal.preventive")}</option>
                <option value="corrective">{t("cal.corrective")}</option>
                <option value="inspection">{t("cal.inspection")}</option>
              </select>
              <input type="date" value={schDate} onChange={e => setSchDate(e.target.value)} className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <input value={schTechnician} onChange={e => setSchTechnician(e.target.value)} placeholder="Technicien" className="w-full bg-surface-3 border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <button onClick={handleSchedule} disabled={!schTitle.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50">
                <Save className="w-4 h-4" /> {t("mach.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-5 mb-4">
        {Object.entries(TYPE_STYLES).map(([key, style]) => (
          <span key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
            {t(style.labelKey)}
          </span>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-surface-3">
          {DAY_KEYS.map(dk => (
            <div key={dk} className="text-center py-3 industrial-label">{t(dk)}</div>
          ))}
        </div>
        {/* Calendar body */}
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => (
            <div
              key={i}
              className={`min-h-[80px] p-2 border-r border-b border-border cursor-pointer transition-colors hover:bg-primary/[0.04] relative ${
                cell.isToday ? 'bg-primary/[0.06]' : ''
              }`}
            >
              <div className={`text-sm font-medium mb-1 ${
                cell.isOther ? 'text-muted-foreground/40' : cell.isToday ? '' : 'text-foreground'
              }`}>
                {cell.isToday ? (
                  <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    {cell.day}
                  </span>
                ) : cell.day}
              </div>
              {cell.events.map((ev, j) => {
                const style = TYPE_STYLES[ev.type];
                return (
                  <div key={j} onClick={(e) => { e.stopPropagation(); openDetail(ev); }} className={`flex items-center gap-1 text-[0.6rem] font-medium px-1.5 py-0.5 rounded mb-0.5 cursor-pointer hover:opacity-80 ${style.bg} ${style.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot} flex-shrink-0`} />
                    <span className="truncate">{ev.label}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Task Detail Modal — portalled to body for correct fixed positioning */}
      {detailEvent && createPortal((() => {
        const ds = TYPE_STYLES[editing ? editType : detailEvent.type];
        const statutLabel = editing
          ? (editStatut === 'terminee' ? 'Terminée' : editStatut === 'en_cours' ? 'En cours' : 'Planifiée')
          : (detailEvent.statut === 'terminee' ? 'Terminée' : detailEvent.statut === 'en_cours' ? 'En cours' : 'Planifiée');
        const statutCls = (editing ? editStatut : detailEvent.statut) === 'terminee' ? 'bg-success/10 text-success' : (editing ? editStatut : detailEvent.statut) === 'en_cours' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning';
        return (
          <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setDetailEvent(null); setEditing(false); }}>
            <div className="bg-card border border-border rounded-2xl p-6 w-[440px] max-w-[95vw] shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${ds.dot}`} />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${ds.bg} ${ds.text}`}>{t(ds.labelKey)}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${statutCls}`}>{statutLabel}</span>
                </div>
                <div className="flex items-center gap-1">
                  {!editing && (
                    <button onClick={() => setEditing(true)} className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                  )}
                  <button onClick={() => { setDetailEvent(null); setEditing(false); }} className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
              </div>
              <h3 className="text-base font-bold text-foreground mb-4">{detailEvent.label}</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20">Machine</span>
                  <span className="text-sm font-semibold text-foreground">{detailEvent.machine}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20">Technicien</span>
                  {editing ? (
                    <input value={editTech} onChange={e => setEditTech(e.target.value)} placeholder="Nom du technicien" className="flex-1 bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  ) : (
                    <span className="text-sm font-medium text-foreground">{detailEvent.technician}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20">Date</span>
                  {editing ? (
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="flex-1 bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  ) : (
                    <span className="text-sm font-medium text-foreground">{new Date(detailEvent.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  )}
                </div>
                {editing && (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20">Statut</span>
                      <select value={editStatut} onChange={e => setEditStatut(e.target.value as TacheStatut)} className="flex-1 bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                        <option value="planifiee">Planifiée</option>
                        <option value="en_cours">En cours</option>
                        <option value="terminee">Terminée</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20">Type</span>
                      <select value={editType} onChange={e => setEditType(e.target.value as TacheType)} className="flex-1 bg-surface-3 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                        <option value="preventive">{t("cal.preventive")}</option>
                        <option value="corrective">{t("cal.corrective")}</option>
                        <option value="inspection">{t("cal.inspection")}</option>
                      </select>
                    </div>
                  </>
                )}
                {!editing && detailEvent.description && (
                  <div className="mt-2 pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground block mb-1.5">Description</span>
                    <p className="text-sm text-secondary-foreground leading-relaxed">{detailEvent.description}</p>
                  </div>
                )}
                {editing && (
                  <button onClick={saveEdit} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground mt-2">
                    <Save className="w-4 h-4" /> {t("mach.save")}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })(), document.getElementById('root')!)}

      {/* Upcoming Interventions */}
      <div className="mt-6">
        <div className="section-title mb-4">{t("cal.upcomingInterventions")}</div>
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {upcomingEvents.map(({ date, event }, i) => {
            const style = TYPE_STYLES[event.type];
            return (
              <div key={i} onClick={() => openDetail(event)} className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-primary/[0.04] transition-colors">
                <span className={`w-2.5 h-2.5 rounded-full ${style.dot} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{event.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{event.machine} — {event.technician}</div>
                </div>
                <div className="text-xs text-muted-foreground font-medium tabular-nums">{date}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
