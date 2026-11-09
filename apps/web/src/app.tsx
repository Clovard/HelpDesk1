import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { getApiUrl, helpdeskApi, saveApiUrl, toApiStatus, toUiIdea, toUiTicket } from "./api";

type View = "tickets" | "ideas" | "settings";
type TicketView = "list" | "kanban";
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
  city: string;
  department: string;
  system: string;
  type: string;
  problem: string;
  expected: string;
  status: TicketStatus;
  comment: string;
  level: string;
  assignee: string;
  scale: string;
};

type Idea = {
  id: string;
  date: string;
  time: string;
  employee: string;
  city: string;
  department: string;
  system: string;
  idea: string;
  expected: string;
  priority: string;
  status: string;
  assignee: string;
  comment: string;
};

const statuses: TicketStatus[] = ["Новая", "На рассмотрении", "В работе", "Закрыта"];
const statusMeta: Record<TicketStatus, { tone: string; dot: string }> = {
  Новая: { tone: "status-new", dot: "#7057D9" },
  "На рассмотрении": { tone: "status-review", dot: "#B7791F" },
  "В работе": { tone: "status-progress", dot: "#3567CF" },
  Закрыта: { tone: "status-closed", dot: "#23856D" },
};

const initialTickets: Ticket[] = [
  {
    id: 1,
    publicId: "REQ-0715086D",
    date: "06.11.2026",
    time: "07:30",
    employee: "Андрей Сарафонов",
    telegram: "@sarafonov_a",
    city: "Новосибирск",
    department: "Офис",
    system: "1С",
    type: "Ошибка",
    problem: "Не формируется отчёт по продажам за текущий месяц",
    expected: "Отчёт формируется без ошибок",
    status: "Новая",
    comment: "",
    level: "L2",
    assignee: "Не назначен",
    scale: "Один сотрудник",
  },
  {
    id: 2,
    publicId: "REQ-FB972DBA",
    date: "05.11.2026",
    time: "09:10",
    employee: "Виталина Петрова",
    telegram: "@vitalina_p",
    city: "Новосибирск",
    department: "Кадровые службы",
    system: "ПК",
    type: "Ошибка",
    problem: "Принтер не забирает бумагу из кассеты",
    expected: "Печать документов восстановлена",
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
    city: "Москва",
    department: "Финансы",
    system: "Битрикс24",
    type: "Доступ",
    problem: "Нет доступа к разделу с договорами",
    expected: "Получить права на просмотр и загрузку",
    status: "На рассмотрении",
    comment: "Запрошено согласование руководителя",
    level: "L1",
    assignee: "Тёма",
    scale: "Один сотрудник",
  },
  {
    id: 4,
    publicId: "REQ-8A42DE10",
    date: "04.11.2026",
    time: "16:25",
    employee: "Игорь Власов",
    telegram: "@vlasov_i",
    city: "Томск",
    department: "Логистика",
    system: "WMS",
    type: "Консультация",
    problem: "Нужно настроить новый шаблон этикетки",
    expected: "Печать этикетки формата 100×70 мм",
    status: "Закрыта",
    comment: "Шаблон добавлен и протестирован",
    level: "L2",
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
    city: "Новосибирск",
    department: "Продажи",
    system: "VPN",
    type: "Ошибка",
    problem: "VPN отключается через несколько минут работы",
    expected: "Стабильное подключение из дома",
    status: "В работе",
    comment: "Диагностика соединения",
    level: "L2",
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
    city: "Москва",
    department: "Маркетинг",
    system: "Почта",
    type: "Настройка",
    problem: "Настроить общую подпись для отдела",
    expected: "Единая подпись у всей команды",
    status: "Закрыта",
    comment: "Шаблон применён",
    level: "L1",
    assignee: "Тёма",
    scale: "Подразделение",
  },
];

const initialIdeas: Idea[] = [
  {
    id: "IDEA-38A7",
    date: "05.11.2026",
    time: "14:18",
    employee: "Елена Соколова",
    city: "Новосибирск",
    department: "Продажи",
    system: "CRM",
    idea: "Добавить быстрые шаблоны ответов клиентам",
    expected: "Сократить время обработки типовых обращений",
    priority: "Средний",
    status: "На оценке",
    assignee: "Тёма",
    comment: "Запланировано интервью с отделом",
  },
  {
    id: "IDEA-12C4",
    date: "02.11.2026",
    time: "10:05",
    employee: "Павел Минаев",
    city: "Томск",
    department: "Логистика",
    system: "WMS",
    idea: "Уведомлять о критическом остатке в Telegram",
    expected: "Быстрее реагировать на дефицит товара",
    priority: "Высокий",
    status: "Принята",
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

function App() {
  const [view, setView] = useState<View>("tickets");
  const [ticketView, setTicketView] = useState<TicketView>("list");
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
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [panel, setPanel] = useState<"details" | "create" | "createIdea" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  async function refreshData(showMessage = false, showLoading = true) {
    if (refreshing.current) return;
    refreshing.current = true;
    if (showLoading) setLoading(true);
    try {
      const [apiTickets, apiIdeas] = await Promise.all([helpdeskApi.tickets(), helpdeskApi.ideas()]);
      setTickets(apiTickets.map(toUiTicket));
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

  async function updateTicket(updated: Ticket) {
    try {
      const saved = await helpdeskApi.updateTicket(updated.id, {
        employee: updated.employee,
        city: updated.city,
        department: updated.department,
        system: updated.system,
        type: updated.type,
        problem: updated.problem,
        expectedResult: updated.expected,
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
        expectedResult: ticket.expected,
        scale: ticket.scale,
      });
      setTickets((current) => [toUiTicket(created), ...current]);
      setPanel(null);
      notify("Заявка создана");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось создать заявку");
      throw error;
    }
  }

  async function createIdea(idea: Omit<Idea, "id" | "date" | "time" | "status" | "assignee" | "comment">) {
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
            <span className="avatar">АС</span>
            <span>
              <strong>Андрей Сарафонов</strong>
              <small>IT-администратор</small>
            </span>
            <button aria-label="Открыть профиль">•••</button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="global-search">
            <Icon name="search" size={19} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти заявку, сотрудника или систему…"
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="topbar-right">
            <span className="today">
              Сегодня, {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(today)}
            </span>
            <button className="icon-round" aria-label="Уведомления">
              <span className="bell-dot" />
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
              </svg>
            </button>
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
          />
        )}
        {view === "ideas" && (
          <IdeasPage ideas={ideas} search={ideasSearch} setSearch={setIdeasSearch} onCreate={() => setPanel("createIdea")} />
        )}
        {view === "settings" && (
          <SettingsPage notify={notify} apiUrl={getApiUrl()} apiOnline={apiOnline} onSaveApiUrl={saveApiUrl} onRefresh={() => void refreshData(true)} />
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
  const levels = [...new Set(tickets.map((ticket) => ticket.level))].sort();
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
            options={levels}
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
              <th>Ожидаемый результат</th>
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
              <tr key={ticket.id} onClick={() => onOpen(ticket)}>
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
                <td className="muted-cell">{ticket.expected}</td>
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
                  className="kanban-card"
                  key={ticket.id}
                  draggable
                  onDragStart={() => onDragStart(ticket.id)}
                  onClick={() => onOpen(ticket)}
                >
                  <div className="kanban-top">
                    <strong>{ticket.publicId}</strong>
                    <span className="level-chip">{ticket.level}</span>
                  </div>
                  <h3>{ticket.problem}</h3>
                  <div className="kanban-tags">
                    <span>{ticket.system}</span>
                    <span>{ticket.type}</span>
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
                    <span>{ticket.assignee}</span>
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
  onCreate,
}: {
  ideas: Idea[];
  search: string;
  setSearch: (value: string) => void;
  onCreate: () => void;
}) {
  const [city, setCity] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const filtered = ideas.filter((idea) =>
    Object.values(idea).join(" ").toLowerCase().includes(search.toLowerCase()) &&
    (!city || idea.city === city) && (!priority || idea.priority === priority) && (!status || idea.status === status),
  );
  const ideaCities = [...new Set(ideas.map((idea) => idea.city).filter(Boolean))].sort();
  const ideaPriorities = [...new Set(ideas.map((idea) => idea.priority).filter(Boolean))].sort();
  const ideaStatuses = [...new Set(ideas.map((idea) => idea.status).filter(Boolean))].sort();
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
      </div>
      <section className="content-card ideas-card">
        <div className="card-toolbar">
          <div>
            <h2>Предложения</h2>
            <span className="count-badge">{filtered.length}</span>
          </div>
          <label className="local-search">
            <Icon name="search" size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по идеям…"
            />
          </label>
          <button className="button primary" onClick={onCreate}><Icon name="plus" size={16} />Добавить идею</button>
        </div>
        <div className="filter-bar">
          <div className="filter-label"><Icon name="filter" size={16} />Фильтры</div>
          <FilterSelect label="Город" value={city} options={ideaCities} onChange={setCity} />
          <FilterSelect label="Приоритет" value={priority} options={ideaPriorities} onChange={setPriority} />
          <FilterSelect label="Статус" value={status} options={ideaStatuses} onChange={setStatus} />
          {(city || priority || status) && <button className="clear-filters" onClick={() => { setCity(""); setPriority(""); setStatus(""); }}>Сбросить <Icon name="close" size={13} /></button>}
        </div>
        {filtered.length ? (
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
                </tr>
              </thead>
              <tbody>
                {filtered.map((idea) => (
                  <tr key={idea.id}>
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
                      <span className="idea-status">{idea.status}</span>
                    </td>
                    <td>{idea.assignee}</td>
                    <td className="muted-cell">{idea.comment}</td>
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
  onCreate: (idea: Omit<Idea, "id" | "date" | "time" | "status" | "assignee" | "comment">) => void | Promise<void>;
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
              <Field label="Ожидаемый результат" textarea value={form.expected} onChange={(value) => set("expected", value)} placeholder="Какой результат это даст?" />
            </section>
          </div>
          <footer className="panel-footer"><span><b>*</b> Обязательные поля</span><div><button type="button" className="button secondary" onClick={onClose}>Отмена</button><button className="button primary" type="submit">Сохранить идею</button></div></footer>
        </form>
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
}: {
  notify: (message: string) => void;
  apiUrl: string;
  apiOnline: boolean;
  onSaveApiUrl: (value: string) => string;
  onRefresh: () => void;
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
              <div><span>ID рабочей группы</span><strong>CHAT_ID · Worker Variable</strong></div>
            </div>
          </div>
          <footer>
            <button className="button secondary" onClick={() => notify("Добавьте BOT_TOKEN как Secret, а CHAT_ID как Variable в настройках Telegram Worker") }>
              <Icon name="send" size={16} />
              Где задать параметры
            </button>
            <button className="button primary" onClick={() => notify("Настройте BOT_TOKEN и CHAT_ID в Cloudflare Worker")}>Инструкция подключения</button>
          </footer>
        </section>
      </div>
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
    expected: "",
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
      city: form.city,
      department: form.department,
      system: form.system,
      type: form.type,
      problem: form.problem,
      expected: form.expected,
      status: "Новая",
      comment: "",
      level: "L1",
      assignee: "Не назначен",
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
                  options={["Новосибирск", "Москва", "Томск"]}
                />
                <SelectField
                  label="Подразделение"
                  required
                  value={form.department}
                  onChange={(value) => set("department", value)}
                  options={[
                    "Офис",
                    "Продажи",
                    "Финансы",
                    "Кадровые службы",
                    "Логистика",
                    "Маркетинг",
                  ]}
                />
                <SelectField
                  label="Система"
                  required
                  value={form.system}
                  onChange={(value) => set("system", value)}
                  options={["1С", "ПК", "Битрикс24", "WMS", "VPN", "Почта"]}
                />
                <SelectField
                  label="Тип обращения"
                  required
                  value={form.type}
                  onChange={(value) => set("type", value)}
                  options={["Ошибка", "Доступ", "Консультация", "Настройка"]}
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
                  <p>Что произошло и какой результат ожидается</p>
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
              <Field
                label="Ожидаемый результат"
                textarea
                value={form.expected}
                onChange={(value) => set("expected", value)}
                placeholder="Что должно измениться после решения?"
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
  const set = (key: keyof Ticket, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
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
            </div>
          </section>
          <section className="form-section">
            <div className="section-heading">
              <span>02</span>
              <div>
                <h3>Описание</h3>
                <p>Ситуация и ожидаемый результат</p>
              </div>
            </div>
            <DetailField
              label="Проблема / ситуация"
              value={draft.problem}
              editing={editing}
              textarea
              onChange={(value) => set("problem", value)}
            />
            <DetailField
              label="Ожидаемый результат"
              value={draft.expected}
              editing={editing}
              textarea
              onChange={(value) => set("expected", value)}
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
                options={["Не назначен", "Андрей", "Тёма", "Пентагон"]}
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
