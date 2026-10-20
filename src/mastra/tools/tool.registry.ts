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

export const leMiningTools = {
  searchLeMiningProducts: searchLeMiningProductsTool,
  searchLeMiningKnowledge: searchLeMiningKnowledgeTool,
  searchLeProductWeb: searchLePublicWebTool,
  searchLeMiningCustomers: searchLeMiningCustomersTool,
  searchLeMiningContacts: searchLeMiningContactsTool,
  searchPublicIntelligence: searchLePublicIntelligenceTool,
};

export const allTools = {
  ...salesTools,
  ...commonTools,
  ...knowledgeTools,
  ...leMiningTools,
  searxngWebSearch: searxngWebSearchTool,
};
