const defaultApiUrl = import.meta.env.VITE_API_URL || "https://helpdesk-api.andrejsarafonov.workers.dev";
const apiUrlKey = "ugli-helpdesk-api-url";

export type ApiTicket = {
  id: number;
  public_id: string;
  date: string;
  time: string;
  employee: string;
  city: string | null;
  department: string | null;
  system: string | null;
  type: string | null;
  problem: string;
  expected_result: string | null;
  status: string;
  it_comment: string | null;
  support_level: string | null;
  assignee: string | null;
  scale: string | null;
  employee_telegram_id: string | null;
};

export type ApiIdea = {
  id: number;
  public_id: string;
  date: string;
  time: string;
  employee: string;
  city: string | null;
  department: string | null;
  system: string | null;
  idea: string;
  expected_result: string | null;
  priority: string;
  status: string;
  assignee: string | null;
  comment: string | null;
};

export function getApiUrl() {
  return (localStorage.getItem(apiUrlKey) || defaultApiUrl).replace(/\/+$/, "");
}

export function saveApiUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  localStorage.setItem(apiUrlKey, normalized);
  return normalized;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("Не удалось связаться с API. Проверьте адрес и подключение.");
  }

  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`API вернул не JSON (HTTP ${response.status}): ${text.slice(0, 180)}`);
  }
  if (!response.ok || body.ok === false) {
    throw new Error(String(body.error || `Ошибка API (HTTP ${response.status})`));
  }
  return body as T;
}

export const helpdeskApi = {
  async health() {
    return request<{ ok: boolean; service: string }>("/");
  },
  async tickets() {
    const result = await request<{ tickets: ApiTicket[] }>("/api/tickets");
    return result.tickets;
  },
  async ideas() {
    const result = await request<{ ideas: ApiIdea[] }>("/api/ideas");
    return result.ideas;
  },
  async createTicket(ticket: Record<string, unknown>) {
    const result = await request<{ ticket: ApiTicket }>("/api/tickets", {
      method: "POST",
      body: JSON.stringify(ticket),
    });
    return result.ticket;
  },
  async createIdea(idea: Record<string, unknown>) {
    return request<{ id: number; publicId: string }>("/api/ideas", {
      method: "POST",
      body: JSON.stringify(idea),
    });
  },
  async updateTicket(id: number, ticket: Record<string, unknown>) {
    const result = await request<{ ticket: ApiTicket }>(`/api/tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(ticket),
    });
    return result.ticket;
  },
  async deleteTicket(id: number) {
    await request(`/api/tickets/${id}`, { method: "DELETE" });
  },
};

export function toUiTicket(ticket: ApiTicket) {
  const status: Record<string, "Новая" | "На рассмотрении" | "В работе" | "Закрыта"> = {
    New: "Новая",
    "Under Review": "На рассмотрении",
    "In Progress": "В работе",
    Closed: "Закрыта",
    Новая: "Новая",
    "На рассмотрении": "На рассмотрении",
    "В работе": "В работе",
    Закрыта: "Закрыта",
  };
  const dateParts = ticket.date?.slice(0, 10).split("-") ?? [];
  return {
    id: ticket.id,
    publicId: ticket.public_id,
    date: dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}` : ticket.date,
    time: ticket.time?.slice(0, 5) ?? "",
    employee: ticket.employee || "Не указано",
    telegram: ticket.employee_telegram_id || "—",
    city: ticket.city || "",
    department: ticket.department || "",
    system: ticket.system || "",
    type: ticket.type || "",
    problem: ticket.problem,
    expected: ticket.expected_result || "",
    status: status[ticket.status] || "Новая",
    comment: ticket.it_comment || "",
    level: ticket.support_level || "L1",
    assignee: ticket.assignee || "Андрей",
    scale: ticket.scale || "",
  };
}

export function toUiIdea(idea: ApiIdea) {
  const dateParts = idea.date?.slice(0, 10).split("-") ?? [];
  const priority: Record<string, string> = {
    Low: "Низкий",
    Medium: "Средний",
    High: "Высокий",
  };
  return {
    id: idea.public_id,
    date: dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}` : idea.date,
    time: idea.time?.slice(0, 5) ?? "",
    employee: idea.employee || "Не указано",
    city: idea.city || "",
    department: idea.department || "",
    system: idea.system || "",
    idea: idea.idea,
    expected: idea.expected_result || "",
    priority: priority[idea.priority] || idea.priority,
    status: idea.status === "New" ? "Новая" : idea.status,
    assignee: idea.assignee || "Андрей",
    comment: idea.comment || "",
  };
}

export function toApiStatus(status: string) {
  const values: Record<string, string> = {
    Новая: "New",
    "На рассмотрении": "Under Review",
    "В работе": "In Progress",
    Закрыта: "Closed",
  };
  return values[status] || status;
}
