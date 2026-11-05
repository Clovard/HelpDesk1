export type ApiClientOptions = {
    apiUrl: string;
};

export class HelpdeskApiClient {
    private readonly apiUrl: string;

    constructor(options: ApiClientOptions) {
        this.apiUrl = options.apiUrl.replace(/\/$/, "");
    }

    async createTicket(data: {
        employee: string;
        city?: string;
        department?: string;
        system?: string;
        type?: string;
        problem: string;
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

        return response.json();
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

        return response.json();
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