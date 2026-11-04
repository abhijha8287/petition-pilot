/**
 * Run the Exhibit A MCP server over stdio.
 *
 *   claude mcp add exhibit-a -- npm --prefix /path/to/exhibit-a run -s mcp
 */
import { exhibitMcpServer } from '../src/mastra/mcp/server';

await exhibitMcpServer.startStdio();
