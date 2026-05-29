import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Brain,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  Save,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useGmaoTaches, type GmaoTache, type TacheStatut, type TacheType } from "@/hooks/useGmaoTaches";
import { useMachines } from "@/hooks/useMachines";
import { useFleetPredictiveInsights } from "@/hooks/useFleetPredictiveInsights";
import { apiFetch } from "@/lib/api";
import {
  getMachinePublicLabel,
  replaceMachineCodesForDisplay,
} from "@/lib/machinePresentation";
import {
  formatHiPercent,
  formatPredictiveRul,
  getUrgencyTone,
} from "@/lib/predictiveLive";

const MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const TYPE_META: Record<TacheType, { label: string; dot: string; badge: string }> = {
  preventive: { label: "Préventive", dot: "bg-success", badge: "bg-success/10 text-success" },
  corrective: { label: "Corrective", dot: "bg-warning", badge: "bg-warning/10 text-warning" },
  inspection: { label: "Inspection", dot: "bg-primary", badge: "bg-primary/10 text-primary" },
};

const STATUS_META: Record<TacheStatut, { label: string; badge: string }> = {
  planifiee: { label: "Planifiée", badge: "bg-primary/10 text-primary" },
  en_cours: { label: "En cours", badge: "bg-warning/10 text-warning" },
  terminee: { label: "Terminée", badge: "bg-success/10 text-success" },
};

interface CalendarEvent {
  id: string;
  title: string;
  machineCode: string;
  technician: string;
  date: string;
  type: TacheType;
  status: TacheStatut;
  description: string;
  cost: number | null;
}

interface TaskDraft {
  title: string;
  machineId: string;
  type: TacheType;
  date: string;
  technician: string;
  cost: string;
}

const EMPTY_DRAFT: TaskDraft = {
  title: "",
  machineId: "",
  type: "preventive",
  date: "",
  technician: "",
  cost: "",
};

const STATUS_ORDER: Record<TacheStatut, number> = {
  en_cours: 0,
  planifiee: 1,
  terminee: 2,
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toCalendarEvent(task: GmaoTache): CalendarEvent | null {
  if (!task.datePlanifiee) return null;
  return {
    id: task.id,
    title: replaceMachineCodesForDisplay(task.titre),
    machineCode: task.machineCode,
    technician: task.technicien || "Non assigné",
    date: task.datePlanifiee.slice(0, 10),
    type: task.type,
    status: task.statut,
    description: replaceMachineCodesForDisplay(task.description || ""),
    cost: task.coutEstime,
  };
}

export function MaintenancePage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const {
    taches,
    addTache,
    updateTache,
    deleteTache,
    isLoading: isLoadingTasks,
  } = useGmaoTaches(currentUser?.machineId);
  const { machines } = useMachines(currentUser?.machineId);
  const { insights, byMachineId, isFetching: isRefreshingInsights } = useFleetPredictiveInsights(machines);
  const isAdmin = currentUser?.role === "admin";
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [didAutoSeedSelection, setDidAutoSeedSelection] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<TaskDraft>(EMPTY_DRAFT);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTech, setEditTech] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState<TacheStatut>("planifiee");
  const [editType, setEditType] = useState<TacheType>("preventive");
  const [editCost, setEditCost] = useState("");

  const aiPendingSummary = useMemo(() => {
    const critical = insights.filter((entry) => entry.urgencyBand === "critical").length;
    const priority = insights.filter((entry) => entry.urgencyBand === "priority").length;
    const total = critical + priority;

    return {
      critical,
      priority,
      total,
    };
  }, [insights]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    taches.forEach((task) => {
      const event = toCalendarEvent(task);
      if (!event) return;
      if (!map[event.date]) {
        map[event.date] = [];
      }
      map[event.date].push(event);
    });
    return map;
  }, [taches]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startDayIndex = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const previousMonthDays = new Date(year, month, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    const cells: {
      day: number;
      isOtherMonth: boolean;
      isToday: boolean;
      events: CalendarEvent[];
      dateKey: string | null;
    }[] = [];

    for (let index = startDayIndex - 1; index >= 0; index -= 1) {
      cells.push({
        day: previousMonthDays - index,
        isOtherMonth: true,
        isToday: false,
        events: [],
        dateKey: null,
      });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        day,
        isOtherMonth: false,
        isToday: isCurrentMonth && today.getDate() === day,
        events: eventsByDate[dateKey] ?? [],
        dateKey,
      });
    }

    const remaining = (7 - (cells.length % 7)) % 7;
    for (let day = 1; day <= remaining; day += 1) {
      cells.push({
        day,
        isOtherMonth: true,
        isToday: false,
        events: [],
        dateKey: null,
      });
    }

    return cells;
  }, [eventsByDate, month, year]);

  const overdueTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return taches.filter(
      (task) => task.datePlanifiee && task.datePlanifiee.slice(0, 10) < today && task.statut !== "terminee",
    );
  }, [taches]);

  const statusCounts = useMemo(
    () =>
      taches.reduce(
        (accumulator, task) => {
          accumulator[task.statut] += 1;
          return accumulator;
        },
        { planifiee: 0, en_cours: 0, terminee: 0 } as Record<TacheStatut, number>,
      ),
    [taches],
  );

  const statusCards = useMemo(
    () => [
      {
        title: "A venir",
        count: statusCounts.planifiee,
        helper: "Taches deja validees a venir",
        dot: "bg-primary",
        valueClassName: "text-primary",
      },
      {
        title: "En cours",
        count: statusCounts.en_cours,
        helper: "Interventions en cours d'execution",
        dot: "bg-warning",
        valueClassName: "text-warning",
      },
      {
        title: "Cloturees",
        count: statusCounts.terminee,
        helper: "Interventions terminees",
        dot: "bg-success",
        valueClassName: "text-success",
      },
    ],
    [statusCounts],
  );

  const selectedDateEvents = useMemo(() => {
    return [...(eventsByDate[selectedDate] ?? [])].sort((left, right) => {
      const statusDiff = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (statusDiff !== 0) return statusDiff;
      return left.title.localeCompare(right.title);
    });
  }, [eventsByDate, selectedDate]);

  const selectedDateStatusCounts = useMemo(
    () =>
      selectedDateEvents.reduce(
        (accumulator, event) => {
          accumulator[event.status] += 1;
          return accumulator;
        },
        { planifiee: 0, en_cours: 0, terminee: 0 } as Record<TacheStatut, number>,
      ),
    [selectedDateEvents],
  );

  const fallbackEvents = useMemo(() => {
    return Object.values(eventsByDate)
      .flat()
      .filter((event) => event.date > selectedDate)
      .sort((left, right) => {
        const dateDiff = left.date.localeCompare(right.date);
        if (dateDiff !== 0) return dateDiff;
        return STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      })
      .slice(0, 3);
  }, [eventsByDate, selectedDate]);

  const getDefaultDateForMonth = useCallback(
    (targetYear: number, targetMonth: number) => {
      const prefix = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-`;
      const monthDates = Object.keys(eventsByDate)
        .filter((date) => date.startsWith(prefix))
        .sort((left, right) => left.localeCompare(right));
      const todayKey = toDateKey(new Date());
      if (monthDates.length > 0) {
        return monthDates.find((date) => date >= todayKey) ?? monthDates[0];
      }
      if (todayKey.startsWith(prefix)) return todayKey;
      return `${prefix}01`;
    },
    [eventsByDate],
  );

  useEffect(() => {
    if (didAutoSeedSelection || isLoadingTasks) return;

    const nextDefault = getDefaultDateForMonth(year, month);
    if (nextDefault !== selectedDate) {
      setSelectedDate(nextDefault);
    }
    setDidAutoSeedSelection(true);
  }, [didAutoSeedSelection, getDefaultDateForMonth, isLoadingTasks, month, selectedDate, year]);

  const openCreateModal = (prefill?: Partial<TaskDraft>) => {
    if (!isAdmin) {
      toast.error("Lecture seule pour votre machine");
      return;
    }
    setDraft({
      ...EMPTY_DRAFT,
      machineId: prefill?.machineId ?? machines[0]?.uuid ?? machines[0]?.id ?? "",
      title: prefill?.title ?? "",
      type: prefill?.type ?? "preventive",
      date: prefill?.date ?? "",
      technician: prefill?.technician ?? "",
      cost: prefill?.cost ?? "",
    });
    setShowCreate(true);
  };

  const changeMonth = (direction: number) => {
    let nextMonth = month + direction;
    let nextYear = year;

    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    }

    setMonth(nextMonth);
    setYear(nextYear);
    setSelectedDate(getDefaultDateForMonth(nextYear, nextMonth));
  };

  const exportCsv = () => {
    const header = "ID,Titre,Machine,Statut,Type,Technicien,Date,Coût estimé\n";
    const rows = taches
      .map((task) =>
        [
          task.id,
          replaceMachineCodesForDisplay(task.titre),
          getMachinePublicLabel(task.machineCode),
          task.statut,
          task.type,
          task.technicien || "-",
          task.datePlanifiee || "-",
          task.coutEstime ?? "-",
        ].join(","),
      )
      .join("\n");

    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `maintenance_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Export CSV pret");
  };

  const createTask = async () => {
    if (!isAdmin) {
      toast.error("Lecture seule pour votre machine");
      return;
    }
    if (!draft.title.trim() || !draft.machineId) return;

    try {
      await addTache.mutateAsync({
        machine_id: draft.machineId,
        titre: draft.title,
        type: draft.type,
        date_planifiee: draft.date || undefined,
        technicien: draft.technician || undefined,
        cout_estime: draft.cost ? Number(draft.cost) : undefined,
      });
      setShowCreate(false);
      setDraft(EMPTY_DRAFT);
      toast.success("Tâche créée");
    } catch {
      // The mutation hook already surfaced the failure toast.
    }
  };

  const openDetail = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEditing(false);
    setEditTech(event.technician === "Non assigné" ? "" : event.technician);
    setEditDate(event.date);
    setEditStatus(event.status);
    setEditType(event.type);
    setEditCost(event.cost != null ? String(event.cost) : "");
  };

  const saveEdit = async () => {
    if (!selectedEvent) return;
    if (!isAdmin) {
      toast.error("Lecture seule pour votre machine");
      return;
    }
    const completedNow = selectedEvent.status !== "terminee" && editStatus === "terminee";
    const machineCode = selectedEvent.machineCode;

    try {
      await updateTache.mutateAsync({
        id: selectedEvent.id,
        technicien: editTech || undefined,
        date_planifiee: editDate || undefined,
        statut: editStatus,
        type: editType,
        cout_estime: editCost ? Number(editCost) : null,
      });

      setSelectedEvent(null);
      setEditing(false);

      if (!completedNow) {
        toast.success("Tâche mise à jour");
        return;
      }

      try {
        await apiFetch(`/machines/reset/${encodeURIComponent(machineCode)}`, {
          method: "POST",
        });
        toast.success("Tâche clôturée et machine réinitialisée");
      } catch (error) {
        toast.warning(
          error instanceof Error
            ? `Tâche clôturée, mais la réinitialisation automatique a échoué : ${error.message}`
            : "Tâche clôturée, mais la réinitialisation automatique a échoué.",
        );
      }
    } catch {
      // The mutation hook already surfaced the failure toast.
    }
  };

  const deleteSelectedEvent = async () => {
    if (!selectedEvent) return;
    if (!isAdmin) {
      toast.error("Lecture seule pour votre machine");
      return;
    }
    if (!window.confirm(`Supprimer la tâche "${selectedEvent.title}" ?`)) {
      return;
    }

    try {
      await deleteTache.mutateAsync(selectedEvent.id);
      setSelectedEvent(null);
      setEditing(false);
      toast.success("Tâche supprimée");
    } catch {
      // The mutation hook already surfaced the failure toast.
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-title">Calendrier des actions validees apres pronostic</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Ici, on suit seulement les taches deja validees. Le pronostic decide d'abord, puis le
            calendrier execute ce qui a ete confirme.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-3 px-4 py-2 text-xs font-semibold text-foreground transition-all hover:bg-border-subtle"
          >
            <Download className="h-3.5 w-3.5" />
            Exporter
          </button>
          {isAdmin ? (
            <button
              onClick={() => openCreateModal()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter une tache manuelle
            </button>
          ) : null}
        </div>
      </div>

      {!isAdmin ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
          Lecture seule: vous voyez uniquement les informations de votre machine. Les ajouts, editions,
          suppressions et reconfigurations restent reserves a l'administrateur.
        </div>
      ) : null}

      <div className="order-1 grid grid-cols-1 gap-3 md:grid-cols-3">
        {statusCards.map((card) => (
          <div key={card.title} className="rounded-2xl border border-border bg-card p-4 shadow-premium">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${card.dot}`} />
              <div className="industrial-label">{card.title}</div>
            </div>
            <div className={`mt-3 text-3xl font-bold ${card.valueClassName}`}>{card.count}</div>
            <div className="mt-1 text-xs text-muted-foreground">{card.helper}</div>
          </div>
        ))}
      </div>

      <div className="order-2 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.75fr)_380px]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <div className="section-title">Execution dans le calendrier</div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Cette vue montre uniquement les taches deja placees apres validation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => changeMonth(-1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-3 text-muted-foreground transition-all hover:bg-border-subtle hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-[160px] text-center text-sm font-semibold text-foreground">
                {MONTHS[month]} {year}
              </div>
              <button
                onClick={() => changeMonth(1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-3 text-muted-foreground transition-all hover:bg-border-subtle hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {Object.values(TYPE_META).map((type) => (
              <span key={type.label} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${type.dot}`} />
                {type.label}
              </span>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="grid grid-cols-7 bg-surface-3">
              {DAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="py-3 text-center text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarCells.map((cell, index) => {
                const isSelected = cell.dateKey === selectedDate;
                return (
                  <button
                    key={`${cell.day}-${index}`}
                    type="button"
                    onClick={() => {
                      if (cell.dateKey) setSelectedDate(cell.dateKey);
                    }}
                    className={`min-h-[110px] border-r border-b border-border px-2 py-2 text-left transition-colors hover:bg-primary/[0.04] ${
                      cell.isOtherMonth ? "bg-surface-3/35" : "bg-card"
                    } ${isSelected ? "bg-primary/[0.06] ring-2 ring-inset ring-primary/20" : ""}`}
                  >
                    <div className="mb-2">
                      {cell.isToday ? (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {cell.day}
                        </span>
                      ) : (
                        <span
                          className={`text-sm font-medium ${cell.isOtherMonth ? "text-muted-foreground/40" : "text-foreground"}`}
                        >
                          {cell.day}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {cell.events.slice(0, 3).map((event) => {
                        const typeMeta = TYPE_META[event.type];
                        return (
                          <div
                            key={event.id}
                            onClick={(eventClick) => {
                              eventClick.stopPropagation();
                              setSelectedDate(event.date);
                              openDetail(event);
                            }}
                            className={`truncate rounded-md px-2 py-1 text-[0.65rem] font-medium ${typeMeta.badge}`}
                          >
                            {event.title}
                          </div>
                        );
                      })}
                      {cell.events.length > 3 && (
                        <div className="text-[0.65rem] font-medium text-muted-foreground">
                          +{cell.events.length - 3} autres
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-premium">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                <div className="section-title">Ce jour-la</div>
              </div>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatDate(selectedDate)}
                {selectedDate === toDateKey(new Date()) ? " · Aujourd'hui" : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedDateEvents.length > 0
                  ? `${selectedDateEvents.length} tache${selectedDateEvents.length > 1 ? "s" : ""} validee${selectedDateEvents.length > 1 ? "s" : ""} ou en cours pour cette date.`
                  : "Aucune tache validee pour cette date."}
              </p>
            </div>
            {isAdmin ? (
              <button
                onClick={() => openCreateModal({ date: selectedDate })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter sur ce jour
              </button>
            ) : null}
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2">
            {(Object.keys(STATUS_META) as TacheStatut[]).map((status) => (
              <div key={status} className="rounded-xl border border-border bg-surface-3 px-3 py-2">
                <div className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {STATUS_META[status].label}
                </div>
                <div className="mt-2 text-lg font-bold text-foreground">{selectedDateStatusCounts[status]}</div>
              </div>
            ))}
          </div>

          {selectedDateEvents.length > 0 ? (
            <div className="space-y-3">
              {selectedDateEvents.map((event) => {
                const typeMeta = TYPE_META[event.type];
                const statusMeta = STATUS_META[event.status];
                const liveContext = byMachineId[event.machineCode];
                const liveTone = liveContext ? getUrgencyTone(liveContext.urgencyBand) : null;

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => {
                      setSelectedDate(event.date);
                      openDetail(event);
                    }}
                    className="w-full rounded-xl border border-border bg-surface-3 p-4 text-left transition-all hover:border-primary/30"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold text-foreground">{event.title}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        {liveContext && (
                          <span
                            className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${liveTone?.badge}`}
                          >
                            {liveContext.urgencyLabel}
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${statusMeta.badge}`}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                    </div>

                    <div className="mb-3 text-xs text-muted-foreground">
                      {getMachinePublicLabel(event.machineCode)} · {event.technician}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[0.7rem]">
                      <span className={`rounded-full px-2.5 py-1 font-semibold ${typeMeta.badge}`}>
                        {typeMeta.label}
                      </span>
                      {liveContext && (
                        <>
                          <span className="rounded-full bg-card px-2.5 py-1 font-semibold text-foreground">
                            HI {formatHiPercent(liveContext.machine.hi)}
                          </span>
                          <span className="rounded-full bg-card px-2.5 py-1 font-semibold text-foreground">
                            RUL {formatPredictiveRul(liveContext)}
                          </span>
                        </>
                      )}
                      <span className="rounded-full bg-card px-2.5 py-1 font-semibold text-foreground">
                        {event.cost != null ? `${event.cost.toLocaleString("fr-FR")} TND` : "Coût à confirmer"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                {isAdmin
                  ? "Cette date est libre pour l'instant. Vous pouvez y ajouter une tache manuelle, ou ouvrir le plan d'action pour valider une recommandation IA avant de l'envoyer ici."
                  : "Cette date est libre pour l'instant. Vous pouvez consulter les prochaines actions validees et ouvrir l'espace IA pour suivre les recommandations de votre machine."}
              </div>

              {fallbackEvents.length > 0 && (
                <div className="rounded-xl border border-border bg-surface-3 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="industrial-label">Prochaines taches deja placees</div>
                    <span className="text-[0.7rem] text-muted-foreground">
                      Apres le {formatDate(selectedDate)}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {fallbackEvents.map((event) => {
                      const typeMeta = TYPE_META[event.type];
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => {
                            setSelectedDate(event.date);
                            openDetail(event);
                          }}
                          className="w-full rounded-xl border border-border bg-card px-3 py-3 text-left transition-all hover:border-primary/30"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground">{event.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {getMachinePublicLabel(event.machineCode)} · {formatDate(event.date)}
                              </div>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${typeMeta.badge}`}>
                              {typeMeta.label}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === Recommandations IA en attente — encart intégré au panneau Planning ===
              Anciennement une carte séparée placée au-dessus du calendrier. Elle est
              désormais montée sous le planning de la date sélectionnée pour regrouper,
              dans une même boîte, les deux espaces qui touchent à la décision côté
              maintenance (interventions du jour + suggestions IA en attente de revue).
              Justification UX : limiter le « scroll-and-scan » en gardant la totalité
              du contexte décisionnel dans un seul cadre visuel. */}
          <div className="mt-5 rounded-2xl border border-border bg-surface-3 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <div className="industrial-label">Pronostic en attente de validation</div>
              </div>
              <span className="rounded-full bg-card px-2.5 py-1 text-[0.6rem] font-semibold text-muted-foreground">
                {isRefreshingInsights ? "Mise à jour..." : "Actualisation 5 s"}
              </span>
            </div>

            <p className="mb-3 text-xs text-muted-foreground">
              {isAdmin
                ? "Le plan d'action IA reste l'espace de decision. Une fois validees, les taches issues du pronostic arrivent ici automatiquement ; l'ajout manuel reste aussi possible."
                : "Le plan d'action IA reste l'espace de decision. Une fois validees, les taches issues du pronostic apparaissent ici automatiquement pour votre machine."}
            </p>

            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-2xl font-bold text-foreground">{aiPendingSummary.total}</div>
              <div className="text-xs font-semibold text-foreground">
                proposition{aiPendingSummary.total > 1 ? "s" : ""} en attente
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5 text-[0.65rem]">
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">
                  {aiPendingSummary.critical} critique{aiPendingSummary.critical > 1 ? "s" : ""}
                </span>
                <span className="rounded-full bg-warning/10 px-2 py-0.5 font-semibold text-warning">
                  {aiPendingSummary.priority} à planifier
                </span>
                <span className="rounded-full bg-surface-3 px-2 py-0.5 font-semibold text-foreground">
                  {overdueTasks.length} tâche{overdueTasks.length > 1 ? "s" : ""} en retard
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate(isAdmin ? "/ia?tab=planner" : "/ia?tab=report")}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90"
            >
              <Brain className="h-3.5 w-3.5" />
              {isAdmin ? "Ouvrir le plan d'action" : "Ouvrir l'espace IA"}
            </button>
          </div>
        </div>
      </div>

      {showCreate && isAdmin && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-[500px] max-w-[95vw] rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="section-title">Nouvelle tâche</div>
              <button
                onClick={() => setShowCreate(false)}
                aria-label="Fermer la création de tâche"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-3 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={draft.title}
                onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))}
                placeholder="Titre de la tâche"
                className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <select
                value={draft.machineId}
                onChange={(event) => setDraft((value) => ({ ...value, machineId: event.target.value }))}
                className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.uuid || machine.id}>
                    {getMachinePublicLabel(machine)}
                  </option>
                ))}
              </select>
              <select
                value={draft.type}
                onChange={(event) => setDraft((value) => ({ ...value, type: event.target.value as TacheType }))}
                className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="preventive">Préventive</option>
                <option value="corrective">Corrective</option>
                <option value="inspection">Inspection</option>
              </select>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) => setDraft((value) => ({ ...value, date: event.target.value }))}
                  className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  value={draft.technician}
                  onChange={(event) => setDraft((value) => ({ ...value, technician: event.target.value }))}
                  placeholder="Technicien"
                  className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <input
                type="number"
                value={draft.cost}
                onChange={(event) => setDraft((value) => ({ ...value, cost: event.target.value }))}
                placeholder="Coût estimé (TND)"
                className="w-full rounded-lg border border-border bg-surface-3 px-3.5 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={() => void createTask()}
                disabled={addTache.isPending || !draft.title.trim() || !draft.machineId}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {addTache.isPending ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedEvent &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => {
              setSelectedEvent(null);
              setEditing(false);
            }}
          >
            <div
              className="w-[460px] max-w-[95vw] rounded-2xl border border-border bg-card p-6 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${TYPE_META[editing ? editType : selectedEvent.type].badge}`}>
                    {TYPE_META[editing ? editType : selectedEvent.type].label}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${STATUS_META[editing ? editStatus : selectedEvent.status].badge}`}>
                    {STATUS_META[editing ? editStatus : selectedEvent.status].label}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && !editing && (
                    <button
                      onClick={() => setEditing(true)}
                      aria-label="Modifier la tâche"
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {isAdmin && !editing && (
                    <button
                      onClick={() => void deleteSelectedEvent()}
                      disabled={deleteTache.isPending}
                      aria-label="Supprimer la tâche"
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedEvent(null);
                      setEditing(false);
                    }}
                    aria-label="Fermer la tâche"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-3 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <h3 className="mb-4 text-base font-bold text-foreground">{selectedEvent.title}</h3>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-24 text-xs text-muted-foreground">Machine</span>
                  <span className="text-sm font-semibold text-foreground">
                    {getMachinePublicLabel(selectedEvent.machineCode)}
                  </span>
                </div>

                {!isAdmin ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
                    Lecture seule: cette fiche reste informative pour votre machine. Les modifications et
                    validations de maintenance sont reservees a l'administrateur.
                  </div>
                ) : null}

                <div className="flex items-center gap-3">
                  <span className="w-24 text-xs text-muted-foreground">Technicien</span>
                  {isAdmin && editing ? (
                    <input
                      value={editTech}
                      onChange={(event) => setEditTech(event.target.value)}
                      className="flex-1 rounded-lg border border-border bg-surface-3 px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  ) : (
                    <span className="text-sm font-medium text-foreground">{selectedEvent.technician}</span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="w-24 text-xs text-muted-foreground">Date</span>
                  {isAdmin && editing ? (
                    <input
                      type="date"
                      value={editDate}
                      onChange={(event) => setEditDate(event.target.value)}
                      className="flex-1 rounded-lg border border-border bg-surface-3 px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  ) : (
                    <span className="text-sm font-medium text-foreground">{formatDate(selectedEvent.date)}</span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="w-24 text-xs text-muted-foreground">Coût</span>
                  {isAdmin && editing ? (
                    <input
                      type="number"
                      value={editCost}
                      onChange={(event) => setEditCost(event.target.value)}
                      className="flex-1 rounded-lg border border-border bg-surface-3 px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  ) : (
                    <span className="text-sm font-medium text-foreground">
                      {selectedEvent.cost != null ? `${selectedEvent.cost.toLocaleString()} TND` : "-"}
                    </span>
                  )}
                </div>

                {isAdmin && editing && (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="w-24 text-xs text-muted-foreground">Statut</span>
                      <select
                        value={editStatus}
                        onChange={(event) => setEditStatus(event.target.value as TacheStatut)}
                        className="flex-1 rounded-lg border border-border bg-surface-3 px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="planifiee">Planifiée</option>
                        <option value="en_cours">En cours</option>
                        <option value="terminee">Terminée</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-24 text-xs text-muted-foreground">Type</span>
                      <select
                        value={editType}
                        onChange={(event) => setEditType(event.target.value as TacheType)}
                        className="flex-1 rounded-lg border border-border bg-surface-3 px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="preventive">Préventive</option>
                        <option value="corrective">Corrective</option>
                        <option value="inspection">Inspection</option>
                      </select>
                    </div>
                  </>
                )}

                {!editing && selectedEvent.description && (
                  <div className="border-t border-border pt-3">
                    <div className="mb-1.5 text-xs text-muted-foreground">Description</div>
                    <p className="text-sm leading-relaxed text-secondary-foreground">{selectedEvent.description}</p>
                  </div>
                )}

                {isAdmin && editing && (
                  <button
                    onClick={() => void saveEdit()}
                    disabled={updateTache.isPending}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                  >
                    <Save className="h-4 w-4" />
                    {updateTache.isPending ? "Enregistrement..." : "Enregistrer"}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
