import { currentTimeTool } from "./common/current-time.tool.js";
import { searchKnowledgeTool } from "./knowledge/search-knowledge.tool.js";
import { searchLeMiningProductsTool } from "./le-mining/search-products.tool.js";
import { searchLeMiningKnowledgeTool } from "./le-mining/search-mining-knowledge.tool.js";
import { searchLePublicWebTool } from "./le-mining/search-public-web.tool.js";
import { searchLeMiningCustomersTool } from "./le-mining/search-customers.tool.js";
import { searchLeMiningContactsTool } from "./le-mining/search-contacts.tool.js";
import { searchLePublicIntelligenceTool } from "./le-mining/search-public-intelligence.tool.js";
import { webSearchTool as searxngWebSearchTool } from "./web/web-search.tool.js";
import { resolveEntityTool } from "./sales/resolve-entity.tool.js";
import { querySalesTool } from "./sales/query-sales.tool.js";
import { getOpportunityTool } from "./sales/get-opportunity.tool.js";
import { checkStockTool } from "./sales/check-stock.tool.js";
import { getMsdsTool } from "./sales/get-msds.tool.js";

export const salesTools = {
  resolveEntity: resolveEntityTool,
  querySales: querySalesTool,
  getOpportunity: getOpportunityTool,
  checkStock: checkStockTool,
  getMsds: getMsdsTool,
};

export const commonTools = {
  currentTime: currentTimeTool,
};

export const knowledgeTools = {
  searchKnowledge: searchKnowledgeTool,
};

/**
 * Tools available to BOTH LE Mining Local and Cloud agents.
 *
 * Important:
 * - searchLeProductWeb stays restricted in code to EON/LE product domains.
 * - unrestricted/public company intelligence is intentionally NOT included here.
 */
export const leMiningCoreTools = {
  searchLeMiningProducts: searchLeMiningProductsTool,
  searchLeMiningKnowledge: searchLeMiningKnowledgeTool,
  searchLeProductWeb: searchLePublicWebTool,
  searchLeMiningCustomers: searchLeMiningCustomersTool,
  searchLeMiningContacts: searchLeMiningContactsTool,
};

/**
 * LOCAL only.
 * Uses the custom SearXNG public-intelligence service.
 */
export const leMiningLocalPublicTools = {
  searchPublicIntelligence: searchLePublicIntelligenceTool,
};

/**
 * Convenience/backward-compatible aggregate.
 * Do not use this object directly inside createLeMiningAgent(), because Cloud
 * must use OpenAI native web_search instead of the SearXNG public tool.
 */
export const leMiningTools = {
  ...leMiningCoreTools,
  ...leMiningLocalPublicTools,
};

export const allTools = {
  ...salesTools,
  ...commonTools,
  ...knowledgeTools,
  ...leMiningCoreTools,
  ...leMiningLocalPublicTools,
  searxngWebSearch: searxngWebSearchTool,
};
