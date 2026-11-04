/**
 * Run the PetitionPilot MCP server over stdio.
 *
 *   claude mcp add petition-pilot -- npm --prefix /path/to/petition-pilot run -s mcp
 */
import { exhibitMcpServer } from '../src/mastra/mcp/server';

await exhibitMcpServer.startStdio();
