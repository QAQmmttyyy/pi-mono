import { startServer } from "../src/index.js";

const { config } = await startServer({ port: 3001 });
console.log(`Server started on http://localhost:${config.port}`);
console.log(`Default work directory: ${config.defaultCwd}`);
