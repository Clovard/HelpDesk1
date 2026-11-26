export type Env = {
    DB: D1Database;
    BOT_TOKEN?: string;
};

export type AppEnv = {
    Bindings: Env;
    Variables: {};
};
