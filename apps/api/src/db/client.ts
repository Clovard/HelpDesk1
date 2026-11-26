export type Env = {
    DB: D1Database;
    BOT_TOKEN?: string;
    BOT_API_TOKEN?: string;
    BOOTSTRAP_SECRET?: string;
};

export type StaffAccount = {
    username: string;
    display_name: string;
    access_role: "Admin" | "Agent";
    support_level: "L1" | "L2" | "L3";
};

export type AppEnv = {
    Bindings: Env;
    Variables: { staff: StaffAccount };
};
