export type TicketStatus =
| "New"
| "Under Review"
| "In Progress"
| "Closed";

export type SupportLevel = "L1" | "L2" | "L3";

export type Ticket = {
    id: string;
    date: string;
    time: string;
    employee: string;
    city: string;
    department: string;
    system: string;
    type: string;
    problem: string;
    expectedResult: string;
    status: TicketStatus;
    itComment: string;
    level: SupportLevel | null;
    assignee: string | null;
    scale: string;
};