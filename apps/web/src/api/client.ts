import type { Ticket } from "../types";

export type Idea = {
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

const API_URL = import.meta.env.VITE_API_URL || "https://helpdesk-api.andrejsarafonov.workers.dev";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(API_URL + path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options?.headers || {}),
        },
    });

    const result = await response.json();

    if (!response.ok || result.ok === false) {
        throw new Error(result.error || "API request failed");
    }

    return result as T;
}

export async function getTickets() {
    return request<{ ok: boolean; tickets: Ticket[] }>("/api/tickets");
}

export async function updateTicket(id: number, data: {
    date?: string;
    time?: string;
    employee?: string;
    city?: string | null;
    department?: string | null;
    system?: string | null;
    type?: string | null;
    problem?: string;
    expectedResult?: string | null;
    status?: string;
    itComment?: string | null;
    supportLevel?: string | null;
    assignee?: string | null;
    scale?: string | null;
}) {
    return request<{ ok: boolean; ticket: Ticket }>("/api/tickets/" + id, {
        method: "PATCH",
        body: JSON.stringify(data),
    });
}

export async function deleteTicket(id: number) {
    return request<{ ok: boolean; deleted: boolean; id: number }>("/api/tickets/" + id, {
        method: "DELETE",
    });
}

export async function getIdeas() {
    return request<{ ok: boolean; ideas: Idea[] }>("/api/ideas");
}
