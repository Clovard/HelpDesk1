export type TicketStatus =
| "New"
| "Under Review"
| "In Progress"
| "Closed";

export type SupportLevel = "L1" | "L2" | "L3" | null;

export type Ticket = {
    id: number;
    public_id: string;
    date: string;
    time: string;
    employee: string;
    employee_telegram_id: string | null;
    city: string | null;
    department: string | null;
    system: string | null;
    type: string | null;
    problem: string;
    expected_result: string | null;
    status: TicketStatus;
    it_comment: string | null;
    support_level: SupportLevel;
    assignee: string | null;
    scale: string | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
};
