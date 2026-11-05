export type IdeaStatus =
| "New"
| "Under Review"
| "Planned"
| "In Progress"
| "Implemented"
| "Rejected";

export type Idea = {
    id: string;
    date: string;
    time: string;
    employee: string;
    city: string;
    department: string;
    system: string;
    idea: string;
    expectedResult: string;
    priority: "Low" | "Medium" | "High";
    status: IdeaStatus;
    assignee: string | null;
    comment: string;
    linkedTicketId: string | null;
};