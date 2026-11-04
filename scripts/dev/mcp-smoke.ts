/** Connects to the MCP server over stdio like an external agent would, lists tools and calls one. */
import { MCPClient } from '@mastra/mcp';

const client = new MCPClient({
  registerProcessHooks: false,
  servers: { exhibit: { command: 'npx', args: ['tsx', '--env-file=.env.local', 'scripts/mcp-server.ts'] } },
});
const tools = await client.listTools();
console.log('tools:', Object.keys(tools).join(', '));
const res = await tools['exhibit_list_cases'].execute!({}, {} as never);
console.log(JSON.stringify(res).slice(0, 400));
await client.disconnect();
