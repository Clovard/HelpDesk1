import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { authApi, getApiUrl, getStaffUser, helpdeskApi, normalizeTicketAssignee, saveApiUrl, ticketAssigneeForLevel, ticketLevelForAssignee, toApiStatus, toUiIdea, toUiTicket, type ApiTicketConversation, type ApiTicketEvent, type ApiTicketMessage } from "./api";

type View = "tickets" | "ideas" | "messages" | "settings";
type TicketView = "list" | "kanban";
type SavedWorkspaceState = {
  view: View;
  ticketView: TicketView;
  ideaView: TicketView;
  scrollY: number;
};
const SAVED_WORKSPACE_KEY = "ugli-helpdesk-workspace";
const NOTIFICATIONS_KEY = "ugli-helpdesk-notifications";
const NOTIFICATION_SOUND_KEY = "ugli-helpdesk-notification-sound";

type DeskNotification = {
  id: string;
  kind: "ticket" | "message";
  title: string;
  description: string;
  ticketId: number;
  createdAt: string;
  unread: boolean;
};

function readNotifications(): DeskNotification[] {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || "[]");
    return Array.isArray(saved) ? saved.slice(-100) as DeskNotification[] : [];
  } catch {
    return [];
  }
}

function readNotificationSoundEnabled() {
  try {
    return localStorage.getItem(NOTIFICATION_SOUND_KEY) !== "false";
  } catch {
    return true;
  }
}

function readSavedWorkspace(): SavedWorkspaceState {
  const defaults: SavedWorkspaceState = { view: "tickets", ticketView: "list", ideaView: "list", scrollY: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_WORKSPACE_KEY) || "null") as Partial<SavedWorkspaceState> | null;
    if (!saved) return defaults;
    return {
      view: ["tickets", "ideas", "messages", "settings"].includes(saved.view || "") ? saved.view! : defaults.view,
      ticketView: saved.ticketView === "kanban" ? "kanban" : defaults.ticketView,
      ideaView: saved.ideaView === "kanban" ? "kanban" : defaults.ideaView,
      scrollY: typeof saved.scrollY === "number" && Number.isFinite(saved.scrollY) ? Math.max(0, saved.scrollY) : 0,
    };
  } catch {
    return defaults;
  }
}
type IdeaStatus = TicketStatus;
type IdeaFilters = { city: string; priority: string; status: string; assignee: string };
type ExportKind = "tickets" | "ideas";
type TicketStatus = "Новая" | "На рассмотрении" | "В работе" | "Закрыта";
type TicketFilters = {
  city: string;
  assignee: string;
  level: string;
  status: string;
};

type Ticket = {
  id: number;
  publicId: string;
  date: string;
  time: string;
  employee: string;
  telegram: string;
  telegramUserId: string;
  initiatorAcceptance: "pending" | "accepted" | "rejected" | null;
  city: string;
  department: string;
  system: string;
  type: string;
  problem: string;
  status: TicketStatus;
  comment: string;
  level: string;
  assignee: string;
  scale: string;
  photoCount?: number;
  fileCount?: number;
};

type Idea = {
  id: string;
  rowId: number;
  date: string;
  time: string;
  employee: string;
  city: string;
  department: string;
  system: string;
  idea: string;
  expected: string;
  priority: string;
  status: IdeaStatus;
  assignee: string;
  comment: string;
  photoCount?: number;
  fileCount?: number;
};

function attachmentSummary(photoCount = 0, fileCount = 0) {
  if (!photoCount && !fileCount) return "Нет вложений";
  return [photoCount ? `Фото: ${photoCount}` : "", fileCount ? `Файлы: ${fileCount}` : ""]
    .filter(Boolean)
    .join(" · ");
}

function formatTicketChatTime(value: string) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Novosibirsk",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTicketHistoryTime(value: string) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Novosibirsk",
    year: "numeric",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ticketEventText(event: ApiTicketEvent) {
  const statusNames: Record<string, string> = {
    New: "Новая", "Under Review": "На рассмотрении", "In Progress": "В работе", Closed: "Закрыта",
  };
  if (event.event_type === "ticket_created") return "Заявка создана";
  if (event.event_type === "status_changed") {
    const from = statusNames[event.old_value || ""] || event.old_value || "—";
    const to = statusNames[event.new_value || ""] || event.new_value || "—";
    return to === "В работе" ? `Заявка взята в работу (${from} → ${to})` : `Статус изменён: ${from} → ${to}`;
  }
  if (event.event_type === "assignee_changed") return `Ответственный изменён: ${event.old_value || "—"} → ${event.new_value || "—"}`;
  if (event.event_type === "level_changed") return `Уровень изменён: ${event.old_value || "—"} → ${event.new_value || "—"}`;
  if (event.event_type === "comment_added") return "Добавлен комментарий IT";
  if (event.event_type === "it_comment_changed") return "Комментарий IT изменён";
  return event.event_type;
}

function ticketEventAuthor(value: string) {
  return value === "Helpdesk" ? "ИТ-поддержка" : value;
}

const statuses: TicketStatus[] = ["Новая", "На рассмотрении", "В работе", "Закрыта"];
const supportLevels = ["L1", "L2", "L3"];
const ideaStatuses: IdeaStatus[] = ["Новая", "На рассмотрении", "В работе", "Закрыта"];
const statusMeta: Record<TicketStatus, { tone: string; dot: string }> = {
  Новая: { tone: "status-new", dot: "#42A5D5" },
  "На рассмотрении": { tone: "status-review", dot: "#5279E6" },
  "В работе": { tone: "status-progress", dot: "#D88A24" },
  Закрыта: { tone: "status-closed", dot: "#3B9D75" },
};

const initialTickets: Ticket[] = [
  {
    id: 1,
    publicId: "REQ-0715086D",
    date: "06.11.2026",
    time: "07:30",
    employee: "Андрей Сарафонов",
    telegram: "@sarafonov_a",
    telegramUserId: "",
    initiatorAcceptance: null,
    city: "Новосибирск",
    department: "Офис",
    system: "1С",
    type: "Ошибка",
    problem: "Не формируется отчёт по продажам за текущий месяц",
    status: "Новая",
    comment: "",
    level: "L1",
    assignee: "Андрей",
    scale: "Один сотрудник",
  },
  {
    id: 2,
    publicId: "REQ-FB972DBA",
    date: "05.11.2026",
    time: "09:10",
    employee: "Виталина Петрова",
    telegram: "@vitalina_p",
    telegramUserId: "",
    initiatorAcceptance: null,
    city: "Новосибирск",
    department: "Кадровые службы",
    system: "ПК",
    type: "Ошибка",
    problem: "Принтер не забирает бумагу из кассеты",
    status: "В работе",
    comment: "Проверяем ролик подачи бумаги",
    level: "L1",
    assignee: "Андрей",
    scale: "Один сотрудник",
  },
  {
    id: 3,
    publicId: "REQ-3F28C91A",
    date: "05.11.2026",
    time: "11:42",
    employee: "Мария Лаврова",
    telegram: "@maria_l",
    telegramUserId: "",
    initiatorAcceptance: null,
    city: "Москва",
    department: "Финансы",
    system: "Битрикс24",
    type: "Доступ",
    problem: "Нет доступа к разделу с договорами",
    status: "На рассмотрении",
    comment: "Запрошено согласование руководителя",
    level: "L2",
    assignee: "Артём",
    scale: "Один сотрудник",
  },
  {
    id: 4,
    publicId: "REQ-8A42DE10",
    date: "04.11.2026",
    time: "16:25",
    employee: "Игорь Власов",
    telegram: "@vlasov_i",
    telegramUserId: "",
    initiatorAcceptance: null,
    city: "Томск",
    department: "Логистика",
    system: "WMS",
    type: "Консультация",
    problem: "Нужно настроить новый шаблон этикетки",
    status: "Закрыта",
    comment: "Шаблон добавлен и протестирован",
    level: "L1",
    assignee: "Андрей",
    scale: "Подразделение",
  },
  {
    id: 5,
    publicId: "REQ-119F75BC",
    date: "04.11.2026",
    time: "13:05",
    employee: "Сергей Орлов",
    telegram: "@orlov_s",
    telegramUserId: "",
    initiatorAcceptance: null,
    city: "Новосибирск",
    department: "Продажи",
    system: "VPN",
    type: "Ошибка",
    problem: "VPN отключается через несколько минут работы",
    status: "В работе",
    comment: "Диагностика соединения",
    level: "L3",
    assignee: "Пентагон",
    scale: "Один сотрудник",
  },
  {
    id: 6,
    publicId: "REQ-6C24A380",
    date: "03.11.2026",
    time: "10:20",
    employee: "Ольга Белова",
    telegram: "@belova_o",
    telegramUserId: "",
    initiatorAcceptance: null,
    city: "Москва",
    department: "Маркетинг",
    system: "Почта",
    type: "Настройка",
    problem: "Настроить общую подпись для отдела",
    status: "Закрыта",
    comment: "Шаблон применён",
    level: "L2",
    assignee: "Артём",
    scale: "Подразделение",
  },
];

const initialIdeas: Idea[] = [
  {
    id: "IDEA-38A7",
    rowId: -1,
    date: "05.11.2026",
    time: "14:18",
    employee: "Елена Соколова",
    city: "Новосибирск",
    department: "Продажи",
    system: "CRM",
    idea: "Добавить быстрые шаблоны ответов клиентам",
    expected: "Сократить время обработки типовых обращений",
    priority: "Средний",
    status: "На рассмотрении",
    assignee: "Тёма",
    comment: "Запланировано интервью с отделом",
  },
  {
    id: "IDEA-12C4",
    rowId: -2,
    date: "02.11.2026",
    time: "10:05",
    employee: "Павел Минаев",
    city: "Томск",
    department: "Логистика",
    system: "WMS",
    idea: "Уведомлять о критическом остатке в Telegram",
    expected: "Быстрее реагировать на дефицит товара",
    priority: "Высокий",
    status: "В работе",
    assignee: "Андрей",
    comment: "Включено в план развития",
  },
];

const iconPaths: Record<string, React.ReactNode> = {
  tickets: (
    <>
      <path d="M6 4h12a2 2 0 0 1 2 2v3a3 3 0 0 0 0 6v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 1 2-2Z" />
      <path d="M13 8h3M13 12h3M13 16h3M8 8h.01M8 12h.01M8 16h.01" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M8.2 14.5A7 7 0 1 1 15.8 14.5C14.6 15.4 15 17 13 17h-2c-2 0-1.6-1.6-2.8-2.5Z" />
    </>
  ),
  messages: (
    <>
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-7.5A7.5 7.5 0 1 1 20 11.5Z" />
      <path d="M8 10h8M8 14h5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.36.7.66.96.3.26.68.4 1.07.4H21v4h-.09a1.7 1.7 0 0 0-1.51.64Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.5" cy="6" r=".5" />
      <circle cx="3.5" cy="12" r=".5" />
      <circle cx="3.5" cy="18" r=".5" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="4" width="7" height="16" rx="1.5" />
      <rect x="14" y="4" width="7" height="10" rx="1.5" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m15 8 4 4-4 4" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  edit: (
    <>
      <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
      <path d="m13.5 8 3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  filter: (
    <>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </>
  ),
  empty: (
    <>
      <path d="M4 7h16v13H4zM8 4h8l2 3H6l2-3Z" />
      <path d="M9 12h6" />
    </>
  ),
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`status-badge ${statusMeta[status].tone}`}>
      <i />
      {status}
    </span>
  );
}

function displayDateToIso(date: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escapeCell = (value: string) => {
    const safeValue = /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replace(/"/g, '""')}"`;
  };
  const content = [headers, ...rows].map((row) => row.map(escapeCell).join(";")).join("\r\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const staffUser = getStaffUser();
  const [initialWorkspace] = useState(readSavedWorkspace);
  const [view, setView] = useState<View>(initialWorkspace.view);
  const [ticketView, setTicketView] = useState<TicketView>(initialWorkspace.ticketView);
  const [ideaView, setIdeaView] = useState<TicketView>(initialWorkspace.ideaView);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [apiOnline, setApiOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const refreshing = useRef(false);
  const [today, setToday] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TicketFilters>({
    city: "",
    assignee: "",
    level: "",
    status: "",
  });
  const [ideasSearch, setIdeasSearch] = useState("");
  const [ideaFilters, setIdeaFilters] = useState<IdeaFilters>({ city: "", priority: "", status: "", assignee: "" });
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [panel, setPanel] = useState<"details" | "create" | "createIdea" | "ideaDetails" | "exportTickets" | "exportIdeas" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [editingIdea, setEditingIdea] = useState(false);
  const [draggedIdeaId, setDraggedIdeaId] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [notifications, setNotifications] = useState<DeskNotification[]>(readNotifications);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(readNotificationSoundEnabled);
  const scrollRestored = useRef(false);
  const audioContext = useRef<AudioContext | null>(null);
  const knownTicketIds = useRef<Set<number> | null>(null);
  const knownConversationSignatures = useRef<Map<number, string> | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const unreadNotificationCount = notifications.reduce((count, item) => count + (item.unread ? 1 : 0), 0);

  function unlockAudio() {
    if (!audioContext.current && window.AudioContext) audioContext.current = new window.AudioContext();
    if (audioContext.current?.state === "suspended") void audioContext.current.resume();
  }

  function playNotificationSound(kind: DeskNotification["kind"]) {
    const context = audioContext.current;
    if (!soundEnabledRef.current || !context || context.state !== "running") return;
    const tones = kind === "ticket"
      ? [{ frequency: 587, start: 0 }, { frequency: 784, start: 0.16 }]
      : [{ frequency: 880, start: 0 }, { frequency: 698, start: 0.12 }, { frequency: 880, start: 0.24 }];
    for (const tone of tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + tone.start;
      oscillator.type = "sine";
      oscillator.frequency.value = tone.frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.11, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.16);
    }
  }

  function addNotification(kind: DeskNotification["kind"], title: string, description: string, ticketId: number) {
    const item: DeskNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      kind,
      title,
      description,
      ticketId,
      createdAt: new Date().toISOString(),
      unread: true,
    };
    setNotifications((current) => [...current, item].slice(-100));
    playNotificationSound(kind);
  }

  useEffect(() => {
    const unlock = () => {
      if (soundEnabledRef.current) unlockAudio();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
      document.title = unreadNotificationCount
        ? `(${unreadNotificationCount}) Угли IT — Центр поддержки`
        : "Угли IT — Центр поддержки";
    } catch {
      // Keep notifications in memory if browser storage is unavailable.
    }
  }, [notifications, unreadNotificationCount]);

  useEffect(() => {
    try { localStorage.setItem(NOTIFICATION_SOUND_KEY, String(soundEnabled)); } catch { /* session-only preference */ }
  }, [soundEnabled]);

  useEffect(() => {
    const saveWorkspace = (scrollY = window.scrollY) => {
      try {
        localStorage.setItem(SAVED_WORKSPACE_KEY, JSON.stringify({ view, ticketView, ideaView, scrollY }));
      } catch {
        // The app remains usable when browser storage is unavailable.
      }
    };
    let scrollTimer = 0;
    const handleScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        if (scrollRestored.current) saveWorkspace();
      }, 120);
    };
    const handlePageHide = () => saveWorkspace();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.clearTimeout(scrollTimer);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [view, ticketView, ideaView]);

  useEffect(() => {
    if (loading || scrollRestored.current) return;
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, initialWorkspace.scrollY));
    scrollRestored.current = true;
    return () => window.cancelAnimationFrame(frame);
  }, [initialWorkspace.scrollY, loading]);

  async function refreshData(showMessage = false, showLoading = true) {
    if (refreshing.current) return;
    refreshing.current = true;
    if (showLoading) setLoading(true);
    try {
      const [apiTickets, apiIdeas] = await Promise.all([helpdeskApi.tickets(), helpdeskApi.ideas()]);
      const mappedTickets = apiTickets.map(toUiTicket);
      const previousTicketIds = knownTicketIds.current;
      if (previousTicketIds) {
        for (const ticket of mappedTickets) {
          if (!previousTicketIds.has(ticket.id)) {
            addNotification("ticket", "Новая заявка", `${ticket.publicId} · ${ticket.employee}: ${ticket.problem}`, ticket.id);
          }
        }
      }
      knownTicketIds.current = new Set(mappedTickets.map((ticket) => ticket.id));
      setTickets(mappedTickets);
      setSelected((current) => current
        ? mappedTickets.find((ticket) => ticket.id === current.id) ?? current
        : current);
      setIdeas(apiIdeas.map(toUiIdea));
      setApiOnline(true);
      if (showMessage) notify("Данные обновлены");
    } catch (error) {
      setApiOnline(false);
      if (showMessage) notify(error instanceof Error ? error.message : "Не удалось обновить данные");
    } finally {
      refreshing.current = false;
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void refreshData();
    const interval = window.setInterval(() => {
      void refreshData(false, false);
    }, 10_000);
    const dateInterval = window.setInterval(() => setToday(new Date()), 60_000);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(dateInterval);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshIncomingMessages = async () => {
      try {
        const conversations = await helpdeskApi.ticketConversations();
        if (!active) return;
        const previous = knownConversationSignatures.current;
        const next = new Map<number, string>();
        for (const conversation of conversations) {
          const signature = `${conversation.last_message_at}|${conversation.last_sender_type}|${conversation.last_message}`;
          next.set(conversation.id, signature);
          if (previous?.has(conversation.id)
            && previous.get(conversation.id) !== signature
            && conversation.last_sender_type === "employee") {
            addNotification(
              "message",
              "Новое сообщение",
              `${conversation.public_id} · ${conversation.employee}: ${conversation.last_message}`,
              conversation.id,
            );
          }
        }
        knownConversationSignatures.current = next;
      } catch {
        // Keep normal ticket refresh working if the conversation endpoint is unavailable.
      }
    };
    void refreshIncomingMessages();
    const interval = window.setInterval(() => void refreshIncomingMessages(), 10_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const visibleTickets = useMemo(() => {
    const query = search.toLowerCase().trim();
    return tickets.filter((ticket) => {
      const matchesSearch = !query || Object.values(ticket).join(" ").toLowerCase().includes(query);
      const matchesCity = !filters.city || ticket.city === filters.city;
      const matchesAssignee = !filters.assignee || ticket.assignee === filters.assignee;
      const matchesLevel = !filters.level || ticket.level === filters.level;
      const matchesStatus = !filters.status || ticket.status === filters.status;

      return matchesSearch && matchesCity && matchesAssignee && matchesLevel && matchesStatus;
    });
  }, [filters, search, tickets]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function openTicket(ticket: Ticket) {
    setSelected(ticket);
    setEditing(false);
    setPanel("details");
  }

  function markNotificationRead(id: string) {
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, unread: false } : item));
  }

  function openNotification(item: DeskNotification) {
    markNotificationRead(item.id);
    setNotificationsOpen(false);
    const ticket = tickets.find((candidate) => candidate.id === item.ticketId);
    if (ticket) openTicket(ticket);
  }

  function toggleNotificationSound() {
    const next = !soundEnabled;
    if (next) unlockAudio();
    setSoundEnabled(next);
  }

  async function updateTicket(updated: Ticket) {
    try {
      const saved = await helpdeskApi.updateTicket(updated.id, {
        employee: updated.employee,
        city: updated.city,
        department: updated.department,
        system: updated.system,
        type: updated.type,
        problem: updated.problem,
        status: toApiStatus(updated.status),
        itComment: updated.comment,
        supportLevel: updated.level,
        assignee: updated.assignee,
        scale: updated.scale,
      });
      const mapped = toUiTicket(saved);
      setTickets((current) => current.map((ticket) => (ticket.id === mapped.id ? mapped : ticket)));
      setSelected(mapped);
      notify("Изменения сохранены");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось сохранить заявку");
      throw error;
    }
  }

  async function createTicket(ticket: Ticket) {
    try {
      const created = await helpdeskApi.createTicket({
        employee: ticket.employee,
        city: ticket.city,
        department: ticket.department,
        system: ticket.system,
        type: ticket.type,
        problem: ticket.problem,
        scale: ticket.scale,
      });
      const mapped = toUiTicket(created);
      knownTicketIds.current?.add(mapped.id);
      setTickets((current) => [mapped, ...current]);
      setPanel(null);
      notify("Заявка создана");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось создать заявку");
      throw error;
    }
  }

  async function createIdea(idea: Omit<Idea, "id" | "rowId" | "date" | "time" | "status" | "assignee" | "comment" | "photoCount" | "fileCount">) {
    try {
      await helpdeskApi.createIdea({
        employee: idea.employee,
        city: idea.city,
        department: idea.department,
        system: idea.system,
        idea: idea.idea,
        expectedResult: idea.expected,
        priority: ({ Низкий: "Low", Средний: "Medium", Высокий: "High" } as Record<string, string>)[idea.priority] ?? "Medium",
      });
      const apiIdeas = await helpdeskApi.ideas();
      setIdeas(apiIdeas.map(toUiIdea));
      setPanel(null);
      notify("Идея создана");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось создать идею");
      throw error;
    }
  }

  function openIdea(idea: Idea) {
    setSelectedIdea(idea);
    setEditingIdea(false);
    setPanel("ideaDetails");
  }

  async function updateIdea(updated: Idea) {
    try {
      const saved = await helpdeskApi.updateIdea(updated.rowId, {
        employee: updated.employee,
        city: updated.city,
        department: updated.department,
        system: updated.system,
        idea: updated.idea,
        expectedResult: updated.expected,
        priority: ({ Низкий: "Low", Средний: "Medium", Высокий: "High" } as Record<string, string>)[updated.priority] ?? "Medium",
        status: toApiStatus(updated.status),
        assignee: updated.assignee,
        comment: updated.comment,
      });
      const mapped = toUiIdea(saved);
      setIdeas((current) => current.map((item) => item.rowId === mapped.rowId ? mapped : item));
      setSelectedIdea(mapped);
      notify("Изменения идеи сохранены");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось сохранить идею");
      throw error;
    }
  }

  async function deleteIdea(id: number) {
    try {
      await helpdeskApi.deleteIdea(id);
      setIdeas((current) => current.filter((idea) => idea.rowId !== id));
      setSelectedIdea(null);
      setPanel(null);
      notify("Идея удалена");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось удалить идею");
    }
  }

  async function moveIdea(status: IdeaStatus) {
    if (draggedIdeaId === null) return;
    const idea = ideas.find((item) => item.rowId === draggedIdeaId);
    setDraggedIdeaId(null);
    if (!idea || idea.status === status) return;
    try {
      const saved = await helpdeskApi.updateIdea(idea.rowId, { status: toApiStatus(status) });
      const mapped = toUiIdea(saved);
      setIdeas((current) => current.map((item) => item.rowId === mapped.rowId ? mapped : item));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось изменить статус идеи");
    }
  }

  async function deleteTicket(id: number) {
    try {
      await helpdeskApi.deleteTicket(id);
      setTickets((current) => current.filter((ticket) => ticket.id !== id));
      setPanel(null);
      setSelected(null);
      notify("Заявка удалена");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось удалить заявку");
    }
  }

  async function moveTicket(status: TicketStatus) {
    if (draggedId === null) return;
    const ticket = tickets.find((item) => item.id === draggedId);
    setDraggedId(null);
    if (!ticket || ticket.status === status) return;
    try {
      const saved = await helpdeskApi.updateTicket(ticket.id, { status: toApiStatus(status) });
      const mapped = toUiTicket(saved);
      setTickets((current) => current.map((item) => (item.id === mapped.id ? mapped : item)));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось изменить статус");
    }
  }

  function exportPeriod(kind: ExportKind, from: string, to: string) {
    if (kind === "tickets") {
      const selectedTickets = tickets.filter((ticket) => {
        const date = displayDateToIso(ticket.date);
        return date >= from && date <= to;
      });
      downloadCsv(
        `Заявки_${from}_${to}.csv`,
        [
          "ID",
          "Дата",
          "Время",
          "Сотрудник / Telegram",
          "Город",
          "Подразделение",
          "Система",
          "Тип",
          "Проблема / ситуация",
          "Статус IT",
          "Комментарий IT",
          "Уровень",
          "Ответственный",
          "Масштаб",
        ],
        selectedTickets.map((ticket) => [
          ticket.publicId,
          ticket.date,
          ticket.time,
          `${ticket.employee}${ticket.telegram && ticket.telegram !== "—" ? ` (${ticket.telegram})` : ""}`,
          ticket.city,
          ticket.department,
          ticket.system,
          ticket.type,
          ticket.problem,
          ticket.status,
          ticket.comment || "—",
          ticket.level,
          ticket.assignee,
          ticket.scale,
        ]),
      );
      notify(`Выгрузка заявок завершена: ${selectedTickets.length}`);
    } else {
      const selectedIdeas = ideas.filter((idea) => {
        const date = displayDateToIso(idea.date);
        return date >= from && date <= to;
      });
      downloadCsv(
        `Идеи_${from}_${to}.csv`,
        [
          "ID",
          "Дата",
          "Время",
          "Сотрудник",
          "Город",
          "Подразделение",
          "Система",
          "Идея / тип предложения",
          "Ожидаемый результат",
          "Приоритет",
          "Статус IT",
          "Ответственный",
          "Комментарий",
        ],
        selectedIdeas.map((idea) => [
          idea.id,
          idea.date,
          idea.time,
          idea.employee,
          idea.city,
          idea.department,
          idea.system,
          idea.idea,
          idea.expected,
          idea.priority,
          idea.status,
          idea.assignee,
          idea.comment || "—",
        ]),
      );
      notify(`Выгрузка идей завершена: ${selectedIdeas.length}`);
    }
    setPanel(null);
  }

  const activeExportKind: ExportKind | null =
    panel === "exportTickets" ? "tickets" : panel === "exportIdeas" ? "ideas" : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("tickets")}>
          <span className="brand-logo">
            <img src="/ugli-logo.png" alt="" />
          </span>
          <span className="brand-copy">
            <strong>
              Угли <b>IT</b>
            </strong>
            <small>Центр поддержки</small>
          </span>
        </button>

        <div className="nav-caption">Рабочее пространство</div>
        <nav>
          <button
            className={view === "tickets" ? "nav-item active" : "nav-item"}
            onClick={() => setView("tickets")}
          >
            <Icon name="tickets" />
            <span>Заявки</span>
            <em>{tickets.filter((t) => t.status !== "Закрыта").length}</em>
          </button>
          <button
            className={view === "ideas" ? "nav-item active" : "nav-item"}
            onClick={() => setView("ideas")}
          >
            <Icon name="bulb" />
            <span>Идеи</span>
          </button>
          <button
            className={view === "messages" ? "nav-item active" : "nav-item"}
            onClick={() => setView("messages")}
          >
            <Icon name="messages" />
            <span>Сообщения</span>
          </button>
        </nav>
        <div className="nav-caption lower">Система</div>
        <nav>
          <button
            className={view === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => setView("settings")}
          >
            <Icon name="settings" />
            <span>Настройки</span>
          </button>
        </nav>

        <div className="sidebar-foot">
          <div className="api-card">
            <span className="api-icon">
              <Icon name="globe" size={17} />
            </span>
            <span>
              <strong>{apiOnline ? "API подключён" : loading ? "Подключаем API" : "Нет связи с API"}</strong>
              <small>{apiOnline ? "Синхронизация активна" : "Проверьте настройки подключения"}</small>
            </span>
            <i className={apiOnline ? "" : "offline"} />
          </div>
          <div className="profile">
            <span className="avatar">{staffUser?.displayName.slice(0, 1) || "IT"}</span>
            <span>
              <strong>{staffUser?.displayName || "Центр поддержки"}</strong>
              <small>{staffUser?.role === "Admin" ? "Администратор" : `Технический специалист ${staffUser?.level || ""}`}</small>
            </span>
            <button className="profile-logout" title="Выйти" aria-label="Выйти" onClick={() => void authApi.logout()}>↪</button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          {view !== "messages" && <div className="global-search">
            <Icon name="search" size={19} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти заявку, сотрудника или систему…"
            />
            <kbd>⌘ K</kbd>
          </div>}
          <div className="topbar-right">
            <span className="today">
              Сегодня, {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(today)}
            </span>
            <div className="notification-wrap">
              <button
                className="icon-round"
                aria-label={unreadNotificationCount ? `Уведомления, непрочитано: ${unreadNotificationCount}` : "Уведомления"}
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                {unreadNotificationCount > 0 && <span className="notification-badge">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>}
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
                </svg>
              </button>
              {notificationsOpen && <section className="notification-popover" aria-label="Центр уведомлений">
                <header className="notification-header">
                  <div>
                    <strong>Уведомления</strong>
                    <small>{unreadNotificationCount} непрочитано</small>
                  </div>
                  <button className="notification-read-all" disabled={!unreadNotificationCount} onClick={() => setNotifications((current) => current.map((item) => ({ ...item, unread: false })))}>Прочитать все</button>
                </header>
                <div className="notification-controls">
                  <span>Звуковые сигналы</span>
                  <button className={soundEnabled ? "sound-toggle enabled" : "sound-toggle"} onClick={toggleNotificationSound}>
                    {soundEnabled ? "Включены" : "Выключены"}
                  </button>
                </div>
                <div className="notification-list">
                  {!notifications.length && <p className="notification-empty">Новых событий пока нет.</p>}
                  {[...notifications].reverse().map((item) => (
                    <button key={item.id} className={`notification-item ${item.unread ? "unread" : ""}`} onClick={() => openNotification(item)}>
                      <span className={`notification-item-icon ${item.kind}`}><Icon name={item.kind === "ticket" ? "tickets" : "messages"} size={15} /></span>
                      <span className="notification-item-copy">
                        <strong>{item.title}</strong>
                        <small>{item.description}</small>
                      </span>
                      <time>{new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</time>
                    </button>
                  ))}
                </div>
              </section>}
            </div>
          </div>
        </header>

        {view === "tickets" && (
          <TicketsPage
            tickets={tickets}
            visibleTickets={visibleTickets}
            filters={filters}
            setFilters={setFilters}
            ticketView={ticketView}
            setTicketView={setTicketView}
            onCreate={() => setPanel("create")}
            onOpen={openTicket}
            onRefresh={() => void refreshData(true)}
            loading={loading}
            apiOnline={apiOnline}
            onDragStart={setDraggedId}
            onDrop={moveTicket}
            onExport={() => setPanel("exportTickets")}
          />
        )}
        {view === "ideas" && (
          <IdeasPage
            ideas={ideas}
            search={ideasSearch}
            setSearch={setIdeasSearch}
            filters={ideaFilters}
            setFilters={setIdeaFilters}
            ideaView={ideaView}
            setIdeaView={setIdeaView}
            onCreate={() => setPanel("createIdea")}
            onOpen={openIdea}
            onDragStart={setDraggedIdeaId}
            onDrop={moveIdea}
            onExport={() => setPanel("exportIdeas")}
          />
        )}
        {view === "messages" && <MessagesPage />}
        {view === "settings" && (
          <SettingsPage notify={notify} apiUrl={getApiUrl()} apiOnline={apiOnline} onSaveApiUrl={saveApiUrl} onRefresh={() => void refreshData(true)} isAdmin={staffUser?.role === "Admin"} />
        )}
      </main>

      {panel === "create" && (
        <CreateTicketPanel
          onClose={() => setPanel(null)}
          onCreate={createTicket}
          nextId={tickets.length + 1}
        />
      )}
      {panel === "createIdea" && (
        <CreateIdeaPanel onClose={() => setPanel(null)} onCreate={createIdea} />
      )}
      {panel === "details" && selected && (
        <TicketPanel
          ticket={selected}
          editing={editing}
          setEditing={setEditing}
          onClose={() => setPanel(null)}
          onSave={updateTicket}
          onDelete={deleteTicket}
          notify={notify}
        />
      )}
      {panel === "ideaDetails" && selectedIdea && (
        <IdeaPanel idea={selectedIdea} editing={editingIdea} setEditing={setEditingIdea}
          onClose={() => setPanel(null)} onSave={updateIdea} onDelete={deleteIdea} />
      )}
      {activeExportKind && (
        <ExportPeriodPanel
          kind={activeExportKind}
          records={activeExportKind === "tickets" ? tickets : ideas}
          onClose={() => setPanel(null)}
          onExport={(from, to) => exportPeriod(activeExportKind, from, to)}
        />
      )}
      {toast && (
        <div className="toast">
          <span>
            <Icon name="check" size={15} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}

function MessagesPage() {
  const [conversations, setConversations] = useState<ApiTicketConversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ApiTicketMessage[]>([]);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [listError, setListError] = useState("");
  const [chatError, setChatError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await helpdeskApi.ticketConversations();
        if (!active) return;
        setConversations(result);
        setSelectedId((current) => current && result.some((conversation) => conversation.id === current)
          ? current
          : result[0]?.id ?? null);
        setListError("");
      } catch (error) {
        if (active) setListError(error instanceof Error ? error.message : "Не удалось загрузить диалоги.");
      } finally {
        if (active) setListLoading(false);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      setMessages([]);
      return;
    }
    let active = true;
    setMessages([]);
    setChatLoading(true);
    const refresh = async () => {
      try {
        const result = await helpdeskApi.ticketMessages(selectedId);
        if (active) {
          setMessages((current) => current.length === result.length
            && current.every((message, index) => message.id === result[index].id && message.telegram_status === result[index].telegram_status)
            ? current
            : result);
          setChatError("");
        }
      } catch (error) {
        if (active) setChatError(error instanceof Error ? error.message : "Не удалось загрузить переписку.");
      } finally {
        if (active) setChatLoading(false);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const visibleConversations = conversations.filter((conversation) => {
    const query = search.trim().toLocaleLowerCase("ru");
    return !query || [conversation.public_id, conversation.employee, conversation.employee_telegram_id, conversation.problem, conversation.last_message]
      .filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(query);
  });
  const telegramHandle = selected?.employee_telegram_id?.match(/@[\p{L}\p{N}_]+/u)?.[0];
  const hasTelegramId = Boolean(selected?.telegram_user_id || /(?:ID|идентификатор)\s*:\s*\d+/i.test(selected?.employee_telegram_id ?? ""));

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!selected || !text || sending) return;
    setSending(true);
    setChatError("");
    try {
      const result = await helpdeskApi.sendTicketMessage(selected.id, text);
      setMessages((current) => [...current.filter((message) => message.id !== result.message.id), result.message]);
      setConversations((current) => current.map((conversation) => conversation.id === selected.id
        ? { ...conversation, last_message: result.message.body, last_sender_type: "support" as const, last_message_at: result.message.created_at }
        : conversation));
      setDraft("");
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Не удалось отправить сообщение.");
    } finally {
      setSending(false);
    }
  }

  const displayStatus: Record<string, string> = {
    New: "Новая",
    "Under Review": "На рассмотрении",
    "In Progress": "В работе",
    Closed: "Закрыта",
  };

  return (
    <section className="messenger-page">
      <div className="page-heading messenger-heading">
        <div>
          <div className="breadcrumb">Рабочее пространство <Icon name="chevron" size={13} /> Сообщения</div>
          <h1>Сообщения</h1>
          <p>Переписка с сотрудниками по их заявкам</p>
        </div>
      </div>
      <div className="messenger-shell">
        <aside className="messenger-sidebar">
          <div className="messenger-list-heading">
            <strong>Диалоги</strong>
            <span>{conversations.length}</span>
          </div>
          <label className="messenger-search">
            <Icon name="search" size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по заявке или сотруднику" />
          </label>
          {listError && <p className="messenger-error" role="alert">{listError}</p>}
          <div className="messenger-conversation-list">
            {listLoading && <p className="messenger-empty">Загружаем диалоги…</p>}
            {!listLoading && !listError && !visibleConversations.length && (
              <p className="messenger-empty">{conversations.length ? "Ничего не найдено." : "Пока нет заявок с Telegram для переписки."}</p>
            )}
            {visibleConversations.map((conversation) => {
              const handle = conversation.employee_telegram_id?.match(/@[\p{L}\p{N}_]+/u)?.[0];
              return (
                <button
                  type="button"
                  key={conversation.id}
                  className={`messenger-conversation ${conversation.id === selectedId ? "selected" : ""}`}
                  onClick={() => setSelectedId(conversation.id)}
                >
                  <span className="messenger-avatar"><Icon name="tickets" size={16} /></span>
                  <span className="messenger-conversation-copy">
                    <span className="messenger-conversation-top"><strong>{conversation.public_id}</strong><time>{formatTicketChatTime(conversation.last_message_at)}</time></span>
                    <span className="messenger-handle">{handle || "Telegram"} · {conversation.employee}</span>
                    <span className="messenger-description">{conversation.problem}</span>
                    <span className="messenger-preview">{conversation.last_sender_type ? `${conversation.last_sender_type === "support" ? "Вы: " : ""}${conversation.last_message}` : "Переписка ещё не началась"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="messenger-thread">
          {selected ? (
            <>
              <header className="messenger-thread-header">
                <span className="messenger-avatar large"><Icon name="tickets" size={18} /></span>
                <div>
                  <strong>{selected.public_id}</strong>
                  <small>{selected.employee} · {telegramHandle || "Telegram"} · {displayStatus[selected.status] || selected.status}</small>
                  <p>{selected.problem}</p>
                </div>
              </header>
              <div className="messenger-thread-messages ticket-chat-messages" aria-live="polite">
                {chatLoading && <p className="ticket-chat-empty">Загружаем переписку…</p>}
                {!chatLoading && !messages.length && <p className="ticket-chat-empty">Сообщений пока нет. Напишите сотруднику первое сообщение.</p>}
                {messages.map((message) => (
                  <article key={message.id} className={`ticket-chat-message ${message.sender_type === "support" ? "from-support" : "from-employee"}`}>
                    <div><strong>{message.sender_name}</strong><time>{formatTicketChatTime(message.created_at)}</time></div>
                    <p>{message.body}</p>
                    {message.sender_type === "support" && message.telegram_status === "failed" && <small className="ticket-chat-delivery-error">Не доставлено в Telegram</small>}
                    {message.sender_type === "support" && message.telegram_status === "not_configured" && <small className="ticket-chat-delivery-error">API не настроен для отправки в Telegram</small>}
                  </article>
                ))}
                <div ref={endRef} />
              </div>
              {chatError && <p className="messenger-error" role="alert">{chatError}</p>}
              {!hasTelegramId && <p className="messenger-warning">У этой заявки не сохранён Telegram ID, поэтому ответить сотруднику нельзя.</p>}
              <form className="messenger-composer" onSubmit={sendMessage}>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Напишите сообщение…" rows={2} maxLength={4000} disabled={!hasTelegramId || sending} />
                <button className="button primary" type="submit" disabled={!hasTelegramId || !draft.trim() || sending}>
                  {sending ? "Отправляем…" : "Отправить"}
                </button>
              </form>
            </>
          ) : (
            <div className="messenger-placeholder">
              <Icon name="messages" size={30} />
              <strong>Выберите диалог</strong>
              <span>Заявка и переписка с сотрудником появятся здесь.</span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function TicketsPage({
  tickets,
  visibleTickets,
  filters,
  setFilters,
  ticketView,
  setTicketView,
  onCreate,
  onOpen,
  onRefresh,
  loading,
  apiOnline,
  onDragStart,
  onDrop,
  onExport,
}: {
  tickets: Ticket[];
  visibleTickets: Ticket[];
  filters: TicketFilters;
  setFilters: (filters: TicketFilters) => void;
  ticketView: TicketView;
  setTicketView: (view: TicketView) => void;
  onCreate: () => void;
  onOpen: (ticket: Ticket) => void;
  onRefresh: () => void;
  loading: boolean;
  apiOnline: boolean;
  onDragStart: (id: number) => void;
  onDrop: (status: TicketStatus) => void;
  onExport: () => void;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleTickets.length / pageSize));
  const pageTickets = visibleTickets.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const cities = [...new Set(tickets.map((ticket) => ticket.city))].sort();
  const assignees = [...new Set(tickets.map((ticket) => ticket.assignee))].sort();
  const activeFilters = Object.values(filters).filter(Boolean).length;

  function setFilter(key: keyof TicketFilters, value: string) {
    setFilters({ ...filters, [key]: value });
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="breadcrumb">
            Рабочее пространство <Icon name="chevron" size={13} /> Заявки
          </div>
          <h1>Заявки</h1>
          <p>Обращения сотрудников и работа службы поддержки</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary compact" onClick={onRefresh}>
            <Icon name="refresh" size={17} />
            {loading ? "Загружаем…" : "Обновить"}
          </button>
          <button className="button secondary" onClick={onExport}>
            <Icon name="download" size={16} />
            Выгрузить
          </button>
          <button className="button primary" onClick={onCreate}>
            <Icon name="plus" size={18} />
            Создать заявку
          </button>
        </div>
      </div>

      <section className="metrics">
        <article>
          <div className="metric-label">
            <span className="metric-dot purple" />
            Новые
          </div>
          <strong>{tickets.filter((t) => t.status === "Новая").length}</strong>
          <small>ожидают реакции</small>
        </article>
        <article>
          <div className="metric-label">
            <span className="metric-dot amber" />
            На рассмотрении
          </div>
          <strong>{tickets.filter((t) => t.status === "На рассмотрении").length}</strong>
          <small>требуют оценки</small>
        </article>
        <article>
          <div className="metric-label">
            <span className="metric-dot teal" />В работе
          </div>
          <strong>{tickets.filter((t) => t.status === "В работе").length}</strong>
          <small>решаются сейчас</small>
        </article>
        <article>
          <div className="metric-label">
            <span className="metric-dot gray" />
            Закрыты
          </div>
          <strong>{tickets.filter((t) => t.status === "Закрыта").length}</strong>
          <small>за этот период</small>
        </article>
      </section>

      <section className="content-card">
        <div className="card-toolbar">
          <div>
            <h2>Все заявки</h2>
            <span className="count-badge">{visibleTickets.length}</span>
          </div>
          <div className="view-switch">
            <button
              className={ticketView === "list" ? "active" : ""}
              onClick={() => setTicketView("list")}
            >
              <Icon name="list" size={16} />
              Список
            </button>
            <button
              className={ticketView === "kanban" ? "active" : ""}
              onClick={() => setTicketView("kanban")}
            >
              <Icon name="board" size={16} />
              Канбан
            </button>
          </div>
        </div>
        <div className="filter-bar">
          <div className="filter-label">
            <Icon name="filter" size={16} />
            Фильтры
            {activeFilters > 0 && <span>{activeFilters}</span>}
          </div>
          <FilterSelect
            label="Город"
            value={filters.city}
            options={cities}
            onChange={(value) => setFilter("city", value)}
          />
          <FilterSelect
            label="Ответственный"
            value={filters.assignee}
            options={assignees}
            onChange={(value) => setFilter("assignee", value)}
          />
          <FilterSelect
            label="Уровень"
            value={filters.level}
            options={supportLevels}
            onChange={(value) => setFilter("level", value)}
          />
          <FilterSelect
            label="Статус"
            value={filters.status}
            options={statuses}
            onChange={(value) => setFilter("status", value)}
          />
          {activeFilters > 0 && (
            <button
              className="clear-filters"
              onClick={() => setFilters({ city: "", assignee: "", level: "", status: "" })}
            >
              Сбросить
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
        {!apiOnline && !loading ? (
          <EmptyState title="Нет связи с API" text="Проверьте адрес API в настройках и нажмите «Обновить»." />
        ) : ticketView === "list" ? (
          <TicketTable
            tickets={pageTickets}
            onOpen={onOpen}
            page={page}
            pageCount={pageCount}
            total={visibleTickets.length}
            onPageChange={setPage}
          />
        ) : (
          <Kanban
            tickets={visibleTickets}
            onOpen={onOpen}
            onDragStart={onDragStart}
            onDrop={onDrop}
          />
        )}
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={`filter-select ${value ? "active" : ""}`}>
      <span>{value || label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Все: {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m7 10 5 5 5-5" />
      </svg>
    </label>
  );
}

function TicketTable({
  tickets,
  onOpen,
  page,
  pageCount,
  total,
  onPageChange,
}: {
  tickets: Ticket[];
  onOpen: (ticket: Ticket) => void;
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (!tickets.length)
    return (
      <EmptyState
        title="Заявки не найдены"
        text="Измените поисковый запрос или создайте новую заявку."
      />
    );
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Дата и время</th>
              <th>Сотрудник</th>
              <th>Город</th>
              <th>Подразделение</th>
              <th>Система</th>
              <th>Тип</th>
              <th className="problem-col">Проблема / ситуация</th>
              <th>Статус IT</th>
              <th>Комментарий IT</th>
              <th>Уровень</th>
              <th>Ответственный</th>
              <th>Масштаб</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id} className={`ticket-row ${statusMeta[ticket.status].tone}`} onClick={() => onOpen(ticket)}>
                <td>
                  <strong className="ticket-id">{ticket.publicId}</strong>
                </td>
                <td>
                  <span className="date-cell">
                    {ticket.date}
                    <small>{ticket.time}</small>
                  </span>
                </td>
                <td>
                  <span className="employee-cell">
                    <span className="mini-avatar">
                      {ticket.employee
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <span>
                      {ticket.employee}
                      <small>{ticket.telegram}</small>
                    </span>
                  </span>
                </td>
                <td>{ticket.city}</td>
                <td>{ticket.department}</td>
                <td>
                  <span className="system-chip">{ticket.system}</span>
                </td>
                <td>{ticket.type}</td>
                <td className="problem-cell">{ticket.problem}</td>
                <td>
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="muted-cell">{ticket.comment || "—"}</td>
                <td>
                  <span className="level-chip">{ticket.level}</span>
                </td>
                <td>{ticket.assignee}</td>
                <td>{ticket.scale}</td>
                <td>
                  <button className="row-arrow" aria-label={`Открыть ${ticket.publicId}`}>
                    <Icon name="arrow" size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          Показано {total ? (page - 1) * 10 + 1 : 0}–{Math.min(page * 10, total)} из {total} заявок
        </span>
        <div>
          <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Назад</button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
            <button key={number} className={number === page ? "active" : ""} onClick={() => onPageChange(number)}>{number}</button>
          ))}
          <button disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Вперёд</button>
        </div>
      </div>
    </>
  );
}

function Kanban({
  tickets,
  onOpen,
  onDragStart,
  onDrop,
}: {
  tickets: Ticket[];
  onOpen: (ticket: Ticket) => void;
  onDragStart: (id: number) => void;
  onDrop: (status: TicketStatus) => void;
}) {
  return (
    <div className="kanban">
      {statuses.map((status) => {
        const columnTickets = tickets.filter((ticket) => ticket.status === status);
        return (
          <section
            className="kanban-column"
            key={status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onDrop(status)}
          >
            <header>
              <span>
                <i style={{ background: statusMeta[status].dot }} />
                {status}
              </span>
              <em>{columnTickets.length}</em>
            </header>
            <div className="kanban-stack">
              {columnTickets.map((ticket) => (
                <article
                  className={`kanban-card ${statusMeta[ticket.status].tone}`}
                  key={ticket.id}
                  draggable
                  onDragStart={() => onDragStart(ticket.id)}
                  onClick={() => onOpen(ticket)}
                >
                  <div className="kanban-top">
                    <strong>{ticket.publicId}</strong>
                    <span className="kanban-level"><small>Уровень</small><b>{ticket.level || "—"}</b></span>
                  </div>
                  <div className="kanban-problem">
                    <small>Проблема</small>
                    <h3 title={ticket.problem}>{ticket.problem || "Описание не указано"}</h3>
                  </div>
                  <div className="kanban-fields">
                    <div><small>Система</small><strong title={ticket.system || "Не указана"}>{ticket.system || "Не указана"}</strong></div>
                    <div><small>Тип</small><strong title={ticket.type || "Не указан"}>{ticket.type || "Не указан"}</strong></div>
                    <div><small>Город</small><strong title={ticket.city || "Не указан"}>{ticket.city || "Не указан"}</strong></div>
                  </div>
                  <div className="kanban-person">
                    <span className="mini-avatar">
                      {ticket.employee
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <span>
                      <strong>{ticket.employee}</strong>
                      <small>{ticket.department}</small>
                    </span>
                  </div>
                  <footer>
                    <span>{ticket.date}</span>
                    <span className="kanban-assignee"><small>Ответственный</small><strong>{ticket.assignee || "Не назначен"}</strong></span>
                  </footer>
                </article>
              ))}
              {!columnTickets.length && <div className="kanban-empty">Перетащите заявку сюда</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function IdeasPage({
  ideas,
  search,
  setSearch,
  filters,
  setFilters,
  ideaView,
  setIdeaView,
  onCreate,
  onOpen,
  onDragStart,
  onDrop,
  onExport,
}: {
  ideas: Idea[];
  search: string;
  setSearch: (value: string) => void;
  filters: IdeaFilters;
  setFilters: (value: IdeaFilters) => void;
  ideaView: TicketView;
  setIdeaView: (view: TicketView) => void;
  onCreate: () => void;
  onOpen: (idea: Idea) => void;
  onDragStart: (id: number) => void;
  onDrop: (status: IdeaStatus) => void;
  onExport: () => void;
}) {
  const filtered = ideas.filter((idea) =>
    Object.values(idea).join(" ").toLowerCase().includes(search.toLowerCase()) &&
    (!filters.city || idea.city === filters.city) && (!filters.priority || idea.priority === filters.priority) &&
    (!filters.status || idea.status === filters.status) && (!filters.assignee || idea.assignee === filters.assignee),
  );
  const ideaCities = [...new Set(ideas.map((idea) => idea.city).filter(Boolean))].sort();
  const ideaAssignees = [...new Set(ideas.map((idea) => idea.assignee).filter(Boolean))].sort();
  const activeFilters = Object.values(filters).filter(Boolean).length;
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="breadcrumb">
            Рабочее пространство <Icon name="chevron" size={13} /> Идеи
          </div>
          <h1>Идеи</h1>
          <p>Предложения сотрудников по улучшению систем и процессов</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={onExport}>
            <Icon name="download" size={16} />
            Выгрузить
          </button>
          <button className="button primary" onClick={onCreate}><Icon name="plus" size={16} />Добавить идею</button>
        </div>
      </div>
      <section className="content-card ideas-card">
        <div className="card-toolbar">
          <div>
            <h2>Предложения</h2>
            <span className="count-badge">{filtered.length}</span>
          </div>
          <div className="view-switch">
            <button className={ideaView === "list" ? "active" : ""} onClick={() => setIdeaView("list")}><Icon name="list" size={16} />Список</button>
            <button className={ideaView === "kanban" ? "active" : ""} onClick={() => setIdeaView("kanban")}><Icon name="board" size={16} />Канбан</button>
          </div>
          <label className="local-search">
            <Icon name="search" size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по идеям…"
            />
          </label>
        </div>
        <div className="filter-bar">
          <div className="filter-label"><Icon name="filter" size={16} />Фильтры{activeFilters > 0 && <span>{activeFilters}</span>}</div>
          <FilterSelect label="Город" value={filters.city} options={ideaCities} onChange={(city) => setFilters({ ...filters, city })} />
          <FilterSelect label="Приоритет" value={filters.priority} options={["Низкий", "Средний", "Высокий"]} onChange={(priority) => setFilters({ ...filters, priority })} />
          <FilterSelect label="Ответственный" value={filters.assignee} options={ideaAssignees} onChange={(assignee) => setFilters({ ...filters, assignee })} />
          <FilterSelect label="Статус" value={filters.status} options={ideaStatuses} onChange={(status) => setFilters({ ...filters, status })} />
          {activeFilters > 0 && <button className="clear-filters" onClick={() => setFilters({ city: "", priority: "", status: "", assignee: "" })}>Сбросить <Icon name="close" size={13} /></button>}
        </div>
        {ideaView === "kanban" ? (
          <div className="kanban idea-kanban">
            {ideaStatuses.map((status) => {
              const columnIdeas = filtered.filter((idea) => idea.status === status);
              return <section className="kanban-column" key={status} onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop(status)}>
                <header><span><i style={{ background: statusMeta[status].dot }} />{status}</span><em>{columnIdeas.length}</em></header>
                <div className="kanban-stack">
                  {columnIdeas.map((idea) => <article className="kanban-card" key={idea.rowId} draggable onDragStart={() => onDragStart(idea.rowId)} onClick={() => onOpen(idea)}>
                    <div className="kanban-top"><strong>{idea.id}</strong><span className={`priority ${idea.priority === "Высокий" ? "high" : ""}`}>{idea.priority}</span></div>
                    <div className="kanban-problem">
                      <small>Предложение</small>
                      <h3 title={idea.idea}>{idea.idea}</h3>
                    </div>
                    <div className="kanban-fields">
                      <div><small>Система</small><strong title={idea.system || "Не указана"}>{idea.system || "Не указана"}</strong></div>
                      <div><small>Город</small><strong title={idea.city || "Не указан"}>{idea.city || "Не указан"}</strong></div>
                    </div>
                    <div className="kanban-person"><span className="mini-avatar">{idea.employee.slice(0, 1)}</span><span><strong>{idea.employee}</strong><small>Ответственный: {idea.assignee || "Не назначен"}</small></span></div>
                    <footer><span>{idea.date}</span><span>{attachmentSummary(idea.photoCount, idea.fileCount)}</span></footer>
                  </article>)}
                  {!columnIdeas.length && <div className="kanban-empty">Перетащите идею сюда</div>}
                </div>
              </section>;
            })}
          </div>
        ) : filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Дата и время</th>
                  <th>Сотрудник</th>
                  <th>Город</th>
                  <th>Подразделение</th>
                  <th>Система</th>
                  <th>Идея</th>
                  <th>Ожидаемый результат</th>
                  <th>Приоритет</th>
                  <th>Статус</th>
                  <th>Ответственный</th>
                  <th>Комментарий</th>
                  <th>Вложения</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((idea) => (
                  <tr key={idea.rowId} onClick={() => onOpen(idea)} className="clickable-row">
                    <td>
                      <strong className="ticket-id">{idea.id}</strong>
                    </td>
                    <td>
                      <span className="date-cell">
                        {idea.date}
                        <small>{idea.time}</small>
                      </span>
                    </td>
                    <td>{idea.employee}</td>
                    <td>{idea.city}</td>
                    <td>{idea.department}</td>
                    <td>
                      <span className="system-chip">{idea.system}</span>
                    </td>
                    <td className="problem-cell">{idea.idea}</td>
                    <td className="muted-cell">{idea.expected}</td>
                    <td>
                      <span className={`priority ${idea.priority === "Высокий" ? "high" : ""}`}>
                        {idea.priority}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={idea.status} />
                    </td>
                    <td>{idea.assignee}</td>
                    <td className="muted-cell">{idea.comment}</td>
                    <td className="muted-cell">{attachmentSummary(idea.photoCount, idea.fileCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Идей пока нет" text="Новые предложения сотрудников появятся здесь." />
        )}
      </section>
    </div>
  );
}

function CreateIdeaPanel({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (idea: Omit<Idea, "id" | "rowId" | "date" | "time" | "status" | "assignee" | "comment" | "photoCount" | "fileCount">) => void | Promise<void>;
}) {
  const [form, setForm] = useState({ employee: "", city: "", department: "", system: "", idea: "", expected: "", priority: "Средний" });
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onCreate(form);
    } catch {
      // Parent reports the API error; preserve entered values for retry.
    }
  }
  return (
    <div className="panel-backdrop" onMouseDown={onClose}>
      <aside className="side-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="panel-header">
          <div><span className="eyebrow">Новое предложение</span><h2>Добавить идею</h2><p>Запишите предложение сотрудника</p></div>
          <button className="panel-close" onClick={onClose}><Icon name="close" size={20} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="panel-content">
            <section className="form-section">
              <div className="section-heading"><span>01</span><div><h3>Данные сотрудника</h3><p>Кто предложил улучшение</p></div></div>
              <div className="form-grid">
                <Field label="Сотрудник" required value={form.employee} onChange={(value) => set("employee", value)} placeholder="Имя и фамилия" />
                <SelectField label="Город" required value={form.city} onChange={(value) => set("city", value)} options={["Новосибирск", "Москва", "Томск", "Красноярск"]} />
                <Field label="Подразделение" value={form.department} onChange={(value) => set("department", value)} placeholder="Например, продажи" />
                <Field label="Система" value={form.system} onChange={(value) => set("system", value)} placeholder="Например, 1С" />
                <SelectField label="Приоритет" value={form.priority} onChange={(value) => set("priority", value)} options={["Низкий", "Средний", "Высокий"]} />
              </div>
            </section>
            <section className="form-section">
              <div className="section-heading"><span>02</span><div><h3>Суть предложения</h3><p>Что стоит улучшить и зачем</p></div></div>
              <Field label="Идея / предложение" required textarea value={form.idea} onChange={(value) => set("idea", value)} placeholder="Опишите предложение…" />
              <Field label="Ожидаемый результат" required textarea value={form.expected} onChange={(value) => set("expected", value)} placeholder="Какой результат это даст?" />
            </section>
          </div>
          <footer className="panel-footer"><span><b>*</b> Обязательные поля</span><div><button type="button" className="button secondary" onClick={onClose}>Отмена</button><button className="button primary" type="submit">Сохранить идею</button></div></footer>
        </form>
      </aside>
    </div>
  );
}

function IdeaPanel({
  idea,
  editing,
  setEditing,
  onClose,
  onSave,
  onDelete,
}: {
  idea: Idea;
  editing: boolean;
  setEditing: (value: boolean) => void;
  onClose: () => void;
  onSave: (idea: Idea) => void | Promise<void>;
  onDelete: (id: number) => void;
}) {
  const [draft, setDraft] = useState(idea);
  const set = (key: keyof Idea, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  async function save() {
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // Keep the form open so the user can retry.
    }
  }
  return (
    <div className="panel-backdrop" onMouseDown={onClose}>
      <aside className="side-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="panel-header details-title">
          <div>
            <span className="eyebrow">Подробности идеи</span>
            <h2>{idea.id}</h2>
            <div className="details-meta"><StatusBadge status={draft.status} /><span>Создана {idea.date} в {idea.time}</span></div>
          </div>
          <button className="panel-close" onClick={onClose}><Icon name="close" size={20} /></button>
        </header>
        <div className="details-actions">
          {!editing ? <button className="button primary" onClick={() => setEditing(true)}><Icon name="edit" size={16} />Редактировать</button> : <>
            <button className="button primary" onClick={() => void save()}>Сохранить</button>
            <button className="button secondary" onClick={() => { setDraft(idea); setEditing(false); }}>Отмена</button>
          </>}
          <button className="button danger" onClick={() => { if (window.confirm(`Удалить идею ${idea.id}?`)) onDelete(idea.rowId); }}><Icon name="trash" size={16} />Удалить</button>
        </div>
        <div className="panel-content details-content">
          <section className="form-section">
            <div className="section-heading"><span>01</span><div><h3>Данные предложения</h3><p>Автор и контекст идеи</p></div></div>
            <div className="form-grid view-grid">
              <DetailField label="Сотрудник" value={draft.employee} editing={editing} onChange={(value) => set("employee", value)} />
              <DetailField label="Город" value={draft.city} editing={editing} onChange={(value) => set("city", value)} />
              <DetailField label="Подразделение" value={draft.department} editing={editing} onChange={(value) => set("department", value)} />
              <DetailField label="Система" value={draft.system} editing={editing} onChange={(value) => set("system", value)} />
              <DetailField label="Вложения" value={attachmentSummary(idea.photoCount, idea.fileCount)} />
            </div>
          </section>
          <section className="form-section">
            <div className="section-heading"><span>02</span><div><h3>Суть предложения</h3><p>Идея и ожидаемый эффект</p></div></div>
            <DetailField label="Идея / предложение" value={draft.idea} editing={editing} textarea onChange={(value) => set("idea", value)} />
            <DetailField label="Ожидаемый результат" value={draft.expected} editing={editing} textarea onChange={(value) => set("expected", value)} />
          </section>
          <section className="form-section">
            <div className="section-heading"><span>03</span><div><h3>Рассмотрение IT</h3><p>Приоритет, статус и ответственный</p></div></div>
            <div className="form-grid">
              <SelectField label="Статус" value={draft.status} disabled={!editing} onChange={(value) => set("status", value)} options={ideaStatuses} />
              <SelectField label="Приоритет" value={draft.priority} disabled={!editing} onChange={(value) => set("priority", value)} options={["Низкий", "Средний", "Высокий"]} />
              <SelectField label="Ответственный" value={draft.assignee} disabled={!editing} onChange={(value) => set("assignee", value)} options={["Не назначен", "Андрей", "Тёма", "Пентагон"]} />
            </div>
            <DetailField label="Комментарий IT" value={draft.comment || "Комментарий пока не добавлен"} editing={editing} textarea onChange={(value) => set("comment", value)} />
          </section>
        </div>
      </aside>
    </div>
  );
}

function SettingsPage({
  notify,
  apiUrl: savedApiUrl,
  apiOnline,
  onSaveApiUrl,
  onRefresh,
  isAdmin,
}: {
  notify: (message: string) => void;
  apiUrl: string;
  apiOnline: boolean;
  onSaveApiUrl: (value: string) => string;
  onRefresh: () => void;
  isAdmin: boolean;
}) {
  const [apiUrl, setApiUrl] = useState(savedApiUrl);
  const [apiChecking, setApiChecking] = useState(false);

  async function checkApi() {
    setApiChecking(true);
    try {
      onSaveApiUrl(apiUrl);
      await helpdeskApi.health();
      notify("API доступен");
      onRefresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "API недоступен");
    } finally {
      setApiChecking(false);
    }
  }

  function saveApi() {
    onSaveApiUrl(apiUrl);
    notify("Адрес API сохранён в этом браузере");
    onRefresh();
  }

  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <div className="breadcrumb">
            Система <Icon name="chevron" size={13} /> Настройки
          </div>
          <h1>Настройки</h1>
          <p>Подключения и интеграции центра поддержки</p>
        </div>
      </div>
      <div className="settings-grid">
        {isAdmin && <StaffManagement notify={notify} />}
        <section className="settings-card">
          <header>
            <span className="settings-icon api">
              <Icon name="globe" size={21} />
            </span>
            <span>
              <h2>Подключение API</h2>
              <p>Основной сервер данных HelpDesk</p>
            </span>
            <span className={`connection ${apiOnline ? "good" : ""}`}>
              <i />
              {apiOnline ? "Подключено" : "Не проверено"}
            </span>
          </header>
          <div className="settings-body">
            <label className="form-field full">
              <span>Адрес API Worker</span>
              <input type="url" value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} />
            </label>
            <div className="connection-info">
              <div>
                <span>Состояние сервера</span>
                <strong>
                  <i />
                  {apiOnline ? "Доступен" : "Нет подтверждения"}
                </strong>
              </div>
              <div>
                <span>База данных D1</span>
                <strong>
                  <i />
                  {apiOnline ? "Подключена" : "Нет подтверждения"}
                </strong>
              </div>
              <div>
                <span>Последняя проверка</span>
                <strong>{apiOnline ? "Подключение активно" : "Ожидает проверки"}</strong>
              </div>
            </div>
          </div>
          <footer>
              <button className="button secondary" onClick={() => void checkApi()}>
              <Icon name="refresh" size={16} />
              {apiChecking ? "Проверяем…" : "Проверить подключение"}
            </button>
            <button className="button primary" onClick={saveApi}>
              Сохранить API
            </button>
          </footer>
        </section>

        <section className="settings-card">
          <header>
            <span className="settings-icon telegram">
              <Icon name="send" size={20} />
            </span>
            <span>
              <h2>Telegram-бот</h2>
              <p>Уведомления и создание заявок</p>
            </span>
              <span className="connection">
              <i />
                Настройка в Cloudflare
            </span>
          </header>
          <div className="settings-body">
            <div className="security-note">
              <span className="lock-mark">••</span>
              <p>
                <strong>Секреты защищены</strong>Токен и ID группы задаются в Cloudflare Worker
                Variables/Secrets. Эта форма не отправляет секреты из браузера.
              </p>
            </div>
            <div className="connection-info">
              <div><span>Токен бота</span><strong>BOT_TOKEN · Cloudflare Secret</strong></div>
              <div><span>ID рабочей группы поддержки</span><strong>SUPPORT_CHAT_ID · Worker Variable</strong></div>
            </div>
          </div>
          <footer>
            <button className="button secondary" onClick={() => notify("Добавьте BOT_TOKEN как Secret, а SUPPORT_CHAT_ID как Variable в настройках Telegram Worker") }>
              <Icon name="send" size={16} />
              Где задать параметры
            </button>
            <button className="button primary" onClick={() => notify("Настройте BOT_TOKEN и SUPPORT_CHAT_ID в Cloudflare Worker")}>Инструкция подключения</button>
          </footer>
        </section>
      </div>
    </div>
  );
}

function StaffManagement({ notify }: { notify: (message: string) => void }) {
  type UserRow = { username: string; display_name: string; access_role: string; support_level: string; active: number };
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ username: "", displayName: "", password: "", level: "L1" });
  async function load() {
    try { setUsers(await authApi.staff() as UserRow[]); setLoadError(""); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "Не удалось загрузить пользователей."); }
  }
  useEffect(() => { void load(); }, []);
  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      await authApi.createStaff(form);
      setForm({ username: "", displayName: "", password: "", level: "L1" });
      notify("Пользователь добавлен"); await load();
    } catch (error) { notify(error instanceof Error ? error.message : "Не удалось добавить пользователя"); }
    finally { setSaving(false); }
  }
  async function resetPassword(user: UserRow) {
    const password = window.prompt(`Новый пароль для ${user.display_name} (не менее 8 символов):`);
    if (password === null) return;
    try { await authApi.resetStaffPassword(user.username, password); notify("Пароль изменён; старые сеансы завершены"); }
    catch (error) { notify(error instanceof Error ? error.message : "Не удалось изменить пароль"); }
  }
  async function disable(user: UserRow) {
    if (!window.confirm(`Отключить учётную запись «${user.display_name}»?`)) return;
    try { await authApi.deactivateStaff(user.username); notify("Учётная запись отключена"); await load(); }
    catch (error) { notify(error instanceof Error ? error.message : "Не удалось отключить пользователя"); }
  }
  return <section className="settings-card staff-management">
    <header><span className="settings-icon api">👥</span><span><h2>Пользователи</h2><p>Добавляйте сотрудников и управляйте доступом</p></span></header>
    <div className="settings-body">
      {loadError && <p className="auth-error">{loadError}</p>}
      <div className="staff-list">{users.map((user) => <div className="staff-row" key={user.username}>
        <span><strong>{user.display_name}</strong><small>{user.username} · {user.access_role === "Admin" ? "Администратор" : `Специалист ${user.support_level}`}{!user.active && " · Отключён"}</small></span>
        <span className="staff-actions"><button className="button secondary" onClick={() => void resetPassword(user)}>Пароль</button>{user.access_role !== "Admin" && user.active === 1 && <button className="button secondary" onClick={() => void disable(user)}>Отключить</button>}</span>
      </div>)}</div>
      <form className="staff-form" onSubmit={(event) => void addUser(event)}>
        <label className="form-field"><span>Логин</span><input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="например, ivan" required /></label>
        <label className="form-field"><span>Имя</span><input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Иван Иванов" required /></label>
        <label className="form-field"><span>Временный пароль</span><input type="password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
        <label className="form-field"><span>Уровень</span><select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}><option value="L1">L1</option><option value="L2">L2</option><option value="L3">L3</option></select></label>
        <button className="button primary" disabled={saving}>{saving ? "Добавляем…" : "Добавить пользователя"}</button>
      </form>
    </div>
  </section>;
}

function ExportPeriodPanel({
  kind,
  records,
  onClose,
  onExport,
}: {
  kind: ExportKind;
  records: Array<{ date: string }>;
  onClose: () => void;
  onExport: (from: string, to: string) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const validRange = Boolean(from && to && from <= to);
  const count = validRange
    ? records.filter((record) => {
        const date = displayDateToIso(record.date);
        return date >= from && date <= to;
      }).length
    : 0;

  function toDateInputValue(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function applyPreset(preset: "thisMonth" | "lastMonth" | "year") {
    const today = new Date();
    const start =
      preset === "year"
        ? new Date(today.getFullYear(), 0, 1)
        : preset === "thisMonth"
          ? new Date(today.getFullYear(), today.getMonth(), 1)
          : new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end =
      preset === "lastMonth"
        ? new Date(today.getFullYear(), today.getMonth(), 0)
        : today;
    setFrom(toDateInputValue(start));
    setTo(toDateInputValue(end));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (validRange) onExport(from, to);
  }

  return (
    <div className="panel-backdrop" onMouseDown={onClose}>
      <aside className="side-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="panel-header">
          <div>
            <span className="eyebrow">Экспорт данных</span>
            <h2>Выгрузка {kind === "tickets" ? "заявок" : "идей"}</h2>
            <p>Таблица откроется в Excel</p>
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={20} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="panel-content">
            <section className="form-section">
              <div className="section-heading">
                <span>01</span>
                <div>
                  <h3>Период выгрузки</h3>
                  <p>Обе даты включаются в отчёт</p>
                </div>
              </div>
              <div className="export-presets" aria-label="Быстрый выбор периода">
                <button type="button" className="export-preset" onClick={() => applyPreset("thisMonth")}>
                  Этот месяц
                </button>
                <button type="button" className="export-preset" onClick={() => applyPreset("lastMonth")}>
                  Прошлый месяц
                </button>
                <button type="button" className="export-preset" onClick={() => applyPreset("year")}>
                  С начала года
                </button>
              </div>
              <div className="form-grid">
                <label className="form-field">
                  <span>С даты</span>
                  <input type="date" required value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
                </label>
                <label className="form-field">
                  <span>По дату</span>
                  <input type="date" required value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
                </label>
              </div>
              <p className="export-summary">
                Записей для выгрузки: <strong>{validRange ? count : "—"}</strong>
              </p>
              <div className="security-note">
                <p>Будут выгружены все записи за выбранный период с колонками, как в таблице сайта. Формат CSV совместим с Excel.</p>
              </div>
            </section>
          </div>
          <footer className="panel-footer">
            <span>Формат файла: CSV · Excel</span>
            <div>
              <button type="button" className="button secondary" onClick={onClose}>Отмена</button>
              <button className="button primary" type="submit" disabled={!validRange}>
                <Icon name="download" size={15} /> Скачать таблицу
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </div>
  );
}

function CreateTicketPanel({
  onClose,
  onCreate,
  nextId,
}: {
  onClose: () => void;
  onCreate: (ticket: Ticket) => void | Promise<void>;
  nextId: number;
}) {
  const [form, setForm] = useState({
    employee: "",
    city: "",
    department: "",
    system: "",
    type: "",
    scale: "",
    problem: "",
  });
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onCreate({
      id: nextId,
      publicId: `REQ-${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
      date: "06.11.2026",
      time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      employee: form.employee,
      telegram: "—",
      telegramUserId: "",
      initiatorAcceptance: null,
      city: form.city,
      department: form.department,
      system: form.system,
      type: form.type,
      problem: form.problem,
      status: "Новая",
      comment: "",
      level: "L1",
      assignee: "Андрей",
      scale: form.scale,
      });
    } catch {
      // The parent shows the API error; leave the filled form open for retry.
    }
  }
  return (
    <div className="panel-backdrop" onMouseDown={onClose}>
      <aside className="side-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="panel-header">
          <div>
            <span className="eyebrow">Новая заявка</span>
            <h2>Создать заявку</h2>
            <p>Заполните данные обращения сотрудника</p>
          </div>
          <button className="panel-close" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="panel-content">
            <section className="form-section">
              <div className="section-heading">
                <span>01</span>
                <div>
                  <h3>Данные сотрудника</h3>
                  <p>Кто и откуда обращается в поддержку</p>
                </div>
              </div>
              <div className="form-grid">
                <Field
                  label="Сотрудник"
                  required
                  value={form.employee}
                  onChange={(value) => set("employee", value)}
                  placeholder="Имя и фамилия"
                />
                <SelectField
                  label="Город"
                  required
                  value={form.city}
                  onChange={(value) => set("city", value)}
                  options={["Новосибирск", "Красноярск", "Томск", "Кемерово", "Барнаул"]}
                />
                <SelectField
                  label="Подразделение"
                  required
                  value={form.department}
                  onChange={(value) => set("department", value)}
                  options={["Офис", "Склад", "Логистика", "Закупки", "Другое"]}
                />
                <Field
                  label="Система"
                  required
                  value={form.system}
                  onChange={(value) => set("system", value)}
                  placeholder="Например: 1С, почта, принтер"
                />
                <SelectField
                  label="Тип обращения"
                  required
                  value={form.type}
                  onChange={(value) => set("type", value)}
                  options={["Не работает", "Ошибка", "Доступ", "Настройка", "Оборудование", "Другое"]}
                />
                <SelectField
                  label="Масштаб"
                  required
                  value={form.scale}
                  onChange={(value) => set("scale", value)}
                  options={["Один сотрудник", "Подразделение", "Вся компания"]}
                />
              </div>
            </section>
            <section className="form-section">
              <div className="section-heading">
                <span>02</span>
                <div>
                  <h3>Описание обращения</h3>
                  <p>Опишите, что произошло</p>
                </div>
              </div>
              <Field
                label="Проблема / ситуация"
                required
                textarea
                value={form.problem}
                onChange={(value) => set("problem", value)}
                placeholder="Опишите проблему как можно подробнее…"
              />
            </section>
          </div>
          <footer className="panel-footer">
            <span>
              <b>*</b> Обязательные поля
            </span>
            <div>
              <button type="button" className="button secondary" onClick={onClose}>
                Отмена
              </button>
              <button className="button primary" type="submit">
                Создать заявку
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </div>
  );
}

function TicketPanel({
  ticket,
  editing,
  setEditing,
  onClose,
  onSave,
  onDelete,
  notify,
}: {
  ticket: Ticket;
  editing: boolean;
  setEditing: (value: boolean) => void;
  onClose: () => void;
  onSave: (ticket: Ticket) => void | Promise<void>;
  onDelete: (id: number) => void;
  notify: (message: string) => void;
}) {
  const [draft, setDraft] = useState(ticket);
  const [messages, setMessages] = useState<ApiTicketMessage[]>([]);
  const [events, setEvents] = useState<ApiTicketEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [chatText, setChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(true);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) setDraft(ticket);
  }, [ticket, editing]);

  useEffect(() => {
    let active = true;
    const refreshMessages = async () => {
      try {
        const result = await helpdeskApi.ticketMessages(ticket.id);
        if (active) {
          setMessages((current) => current.length === result.length
            && current.every((message, index) => message.id === result[index].id && message.telegram_status === result[index].telegram_status)
            ? current
            : result);
          setChatError("");
        }
      } catch (error) {
        if (active) setChatError(error instanceof Error ? error.message : "Не удалось загрузить переписку.");
      } finally {
        if (active) setChatLoading(false);
      }
    };
    void refreshMessages();
    const interval = window.setInterval(() => void refreshMessages(), 4000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [ticket.id]);

  useEffect(() => {
    let active = true;
    setEvents([]);
    setEventsLoading(true);
    setEventsError("");
    const refreshEvents = async () => {
      try {
        const result = await helpdeskApi.ticketEvents(ticket.id);
        if (active) {
          setEvents((current) => current.length === result.length
            && current.every((item, index) => item.id === result[index].id)
            ? current
            : result);
          setEventsError("");
        }
      } catch (error) {
        if (active) setEventsError(error instanceof Error ? error.message : "Не удалось загрузить историю.");
      } finally {
        if (active) setEventsLoading(false);
      }
    };
    void refreshEvents();
    const interval = window.setInterval(() => void refreshEvents(), 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [ticket.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendChatMessage(event: FormEvent) {
    event.preventDefault();
    const message = chatText.trim();
    if (!message || chatSending) return;
    setChatSending(true);
    setChatError("");
    try {
      const result = await helpdeskApi.sendTicketMessage(ticket.id, message);
      setMessages((current) => [...current.filter((item) => item.id !== result.message.id), result.message]);
      setChatText("");
      if (!result.delivered) notify(result.message.telegram_status === "not_configured"
        ? "Сообщение сохранено. Добавьте BOT_TOKEN в Worker helpdesk-api, чтобы отправлять сообщения в Telegram."
        : "Сообщение сохранено, но не доставлено в Telegram. Проверьте Telegram ID заявки.");
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Не удалось отправить сообщение.");
    } finally {
      setChatSending(false);
    }
  }

  const set = (key: keyof Ticket, value: string) => setDraft((current) => {
    if (key === "level") {
      return { ...current, level: value, assignee: ticketAssigneeForLevel(value) ?? current.assignee };
    }
    if (key === "assignee") {
      const assignee = normalizeTicketAssignee(value);
      return { ...current, assignee, level: ticketLevelForAssignee(assignee) ?? current.level };
    }
    return { ...current, [key]: value };
  });
  async function save() {
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // Parent reports the API error; keep the edit form open for correction/retry.
    }
  }
  return (
    <div className="panel-backdrop" onMouseDown={onClose}>
      <aside className="side-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="panel-header details-title">
          <div>
            <span className="eyebrow">Подробности заявки</span>
            <h2>{ticket.publicId}</h2>
            <div className="details-meta">
              <StatusBadge status={draft.status} />
              <span>
                Создана {ticket.date} в {ticket.time}
              </span>
            </div>
          </div>
          <button className="panel-close" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="details-actions">
          {!editing ? (
            <button className="button primary" onClick={() => setEditing(true)}>
              <Icon name="edit" size={16} />
              Редактировать
            </button>
          ) : (
            <>
              <button className="button primary" onClick={save}>
                Сохранить
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setDraft(ticket);
                  setEditing(false);
                }}
              >
                Отмена
              </button>
            </>
          )}
          <button className="button danger" onClick={() => onDelete(ticket.id)}>
            <Icon name="trash" size={16} />
            Удалить
          </button>
        </div>
        <div className="panel-content details-content">
          <section className="form-section">
            <div className="section-heading">
              <span>01</span>
              <div>
                <h3>Данные заявки</h3>
                <p>Сотрудник и контекст обращения</p>
              </div>
            </div>
            <div className="form-grid view-grid">
              <DetailField
                label="Сотрудник"
                value={draft.employee}
                editing={editing}
                onChange={(value) => set("employee", value)}
              />
              <DetailField label="Telegram" value={draft.telegram} />
              <DetailField
                label="Приемка инициатором"
                value={ticket.initiatorAcceptance === "accepted" ? "Принята"
                  : ticket.initiatorAcceptance === "rejected" ? "Не принята"
                    : ticket.initiatorAcceptance === "pending" ? "Ожидает ответа" : "—"}
              />
              <DetailField
                label="Город"
                value={draft.city}
                editing={editing}
                onChange={(value) => set("city", value)}
              />
              <DetailField
                label="Подразделение"
                value={draft.department}
                editing={editing}
                onChange={(value) => set("department", value)}
              />
              <DetailField
                label="Система"
                value={draft.system}
                editing={editing}
                onChange={(value) => set("system", value)}
              />
              <DetailField
                label="Тип обращения"
                value={draft.type}
                editing={editing}
                onChange={(value) => set("type", value)}
              />
              <DetailField
                label="Масштаб"
                value={draft.scale}
                editing={editing}
                onChange={(value) => set("scale", value)}
              />
              <DetailField label="Вложения" value={attachmentSummary(ticket.photoCount, ticket.fileCount)} />
            </div>
          </section>
          <section className="form-section">
            <div className="section-heading">
              <span>02</span>
              <div>
                <h3>Описание</h3>
                <p>Описание проблемы сотрудника</p>
              </div>
            </div>
            <DetailField
              label="Проблема / ситуация"
              value={draft.problem}
              editing={editing}
              textarea
              onChange={(value) => set("problem", value)}
            />
          </section>
          <section className="form-section">
            <div className="section-heading">
              <span>03</span>
              <div>
                <h3>Работа IT</h3>
                <p>Статус и ответственный специалист</p>
              </div>
            </div>
            <div className="form-grid">
              <SelectField
                label="Статус"
                value={draft.status}
                disabled={!editing}
                onChange={(value) => set("status", value)}
                options={statuses}
              />
              <SelectField
                label="Уровень"
                value={draft.level}
                disabled={!editing}
                onChange={(value) => set("level", value)}
                options={["L1", "L2", "L3"]}
              />
              <SelectField
                label="Ответственный"
                value={draft.assignee}
                disabled={!editing}
                onChange={(value) => set("assignee", value)}
                options={["Андрей", "Артём", "Пентагон"]}
              />
            </div>
            <DetailField
              label="Комментарий IT"
              value={draft.comment || "Комментарий пока не добавлен"}
              editing={editing}
              textarea
              onChange={(value) => set("comment", value)}
            />
          </section>
          <section className="form-section ticket-history-section">
            <div className="section-heading">
              <span>04</span>
              <div>
                <h3>История заявки</h3>
                <p>Изменения статуса и ответственного</p>
              </div>
            </div>
            {eventsLoading && <p className="ticket-chat-empty">Загружаем историю…</p>}
            {eventsError && <p className="ticket-chat-error" role="alert">{eventsError}</p>}
            {!eventsLoading && !eventsError && !events.length && <p className="ticket-chat-empty">Событий пока нет.</p>}
            {!!events.length && <ol className="ticket-history-list">
              {[...events].reverse().map((event) => (
                <li key={event.id} className="ticket-history-item">
                  <span className="ticket-history-dot" />
                  <div>
                    <strong>{ticketEventText(event)}</strong>
                    <small>{ticketEventAuthor(event.author_name)}</small>
                  </div>
                  <time>{formatTicketHistoryTime(event.created_at)}</time>
                </li>
              ))}
            </ol>}
          </section>
          <section className="form-section ticket-chat-section">
            <div className="section-heading">
              <span>05</span>
              <div>
                <h3>Переписка с сотрудником</h3>
                <p>Сообщения будут отправлены в Telegram сотрудника</p>
              </div>
            </div>
            {!ticket.telegramUserId && (
              <p className="ticket-chat-empty">Для этой заявки нет Telegram ID сотрудника, поэтому написать ему через бота нельзя.</p>
            )}
            <div className="ticket-chat-messages" aria-live="polite">
              {chatLoading && <p className="ticket-chat-empty">Загружаем переписку…</p>}
              {!chatLoading && !messages.length && <p className="ticket-chat-empty">Сообщений пока нет. Напишите сотруднику первое сообщение.</p>}
              {messages.map((message) => (
                <article key={message.id} className={`ticket-chat-message ${message.sender_type === "support" ? "from-support" : "from-employee"}`}>
                  <div><strong>{message.sender_name}</strong><time>{formatTicketChatTime(message.created_at)}</time></div>
                  <p>{message.body}</p>
                  {message.sender_type === "support" && message.telegram_status === "failed" && <small className="ticket-chat-delivery-error">Не доставлено в Telegram</small>}
                  {message.sender_type === "support" && message.telegram_status === "not_configured" && <small className="ticket-chat-delivery-error">Добавьте BOT_TOKEN в Worker API для доставки</small>}
                </article>
              ))}
              <div ref={chatEndRef} />
            </div>
            {chatError && <p className="ticket-chat-error" role="alert">{chatError}</p>}
            <form className="ticket-chat-composer" onSubmit={sendChatMessage}>
              <textarea
                value={chatText}
                onChange={(event) => setChatText(event.target.value)}
                placeholder="Напишите сообщение сотруднику…"
                maxLength={4000}
                rows={3}
                disabled={!ticket.telegramUserId || chatSending}
              />
              <button className="button primary" type="submit" disabled={!ticket.telegramUserId || !chatText.trim() || chatSending}>
                {chatSending ? "Отправляем…" : "Отправить"}
              </button>
            </form>
          </section>
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  required,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className={`form-field ${textarea ? "full" : ""}`}>
      <span>
        {label}
        {required && <b>*</b>}
      </span>
      {textarea ? (
        <textarea
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  required,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label className="form-field">
      <span>
        {label}
        {required && <b>*</b>}
      </span>
      <select
        required={required}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Выберите</option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function DetailField({
  label,
  value,
  editing,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  editing?: boolean;
  onChange?: (value: string) => void;
  textarea?: boolean;
}) {
  return (
    <label className={`detail-field ${textarea ? "full" : ""}`}>
      <span>{label}</span>
      {editing ? (
        textarea ? (
          <textarea value={value} onChange={(event) => onChange?.(event.target.value)} />
        ) : (
          <input value={value} onChange={(event) => onChange?.(event.target.value)} />
        )
      ) : (
        <strong>{value || "—"}</strong>
      )}
    </label>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span>
        <Icon name="empty" size={27} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export default App;
