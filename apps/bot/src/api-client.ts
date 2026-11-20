export type ApiClientOptions = {
    apiUrl: string;
};

export class HelpdeskApiClient {
    private readonly apiUrl: string;

    constructor(options: ApiClientOptions) {
        this.apiUrl = options.apiUrl.replace(/\/$/, "");
    }

    private async readJson(response: Response) {
        const body = await response.text();
        try {
            return JSON.parse(body) as Record<string, unknown>;
        } catch {
            return {
                ok: false,
                error: `API вернул не JSON (HTTP ${response.status}): ${body.slice(0, 180) || "пустой ответ"}`,
            };
        }
    }

    async createTicket(data: {
        employee: string;
        city?: string;
        department?: string;
        system?: string;
        type?: string;
        problem: string;
        employeeTelegramId?: string;
        expectedResult?: string;
        scale?: string;
    }) {
        const response = await fetch(
        `${this.apiUrl}/api/tickets`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        },
        );

        return this.readJson(response);
    }

    async createIdea(data: {
        employee: string;
        city?: string;
        department?: string;
        system?: string;
        idea: string;
        expectedResult?: string;
        priority?: "Low" | "Medium" | "High";
    }) {
        const response = await fetch(
        `${this.apiUrl}/api/ideas`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        },
        );

        return this.readJson(response);
    }

    async getTicketsByEmployee(
    employee: string,
    ) {
        const response = await fetch(
        `${this.apiUrl}/api/tickets`,
        );

        const result = await response.json() as {
            ok: boolean;
            tickets: Array<{
            public_id: string;
            employee: string;
            problem: string;
            status: string;
            }>;
        };

        if (!result.ok) {
            return [];
        }

        return result.tickets.filter(
        (ticket) =>
        ticket.employee === employee,
        );
    }
}
