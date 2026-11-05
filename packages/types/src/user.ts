export type UserRole = "Employee" | "Agent" | "Admin";

export type User = {
    id: string;
    telegramId: string | null;
    name: string;
    role: UserRole;
    city: string | null;
    department: string | null;
};