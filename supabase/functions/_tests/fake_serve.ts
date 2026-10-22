// Stand-in for std/http's serve(): records the handler instead of listening.
type Handler = (req: Request) => Response | Promise<Response>;
export const handlers: Handler[] = [];
export const serve = (h: Handler) => { handlers.push(h); };
