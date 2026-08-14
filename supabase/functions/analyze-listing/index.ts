import { handleAnalyzeListing } from "./handler.ts";

Deno.serve((req: Request) => handleAnalyzeListing(req));
