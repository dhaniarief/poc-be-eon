import { currentTimeTool } from "./common/current-time.tool.js";
import { searchKnowledgeTool } from "./knowledge/search-knowledge.tool.js";
import { webSearchTool as searxngWebSearchTool } from "./web/web-search.tool.js";
import { resolveEntityTool } from "./sales/resolve-entity.tool.js";
import { querySalesTool } from "./sales/query-sales.tool.js";
import { getOpportunityTool } from "./sales/get-opportunity.tool.js";
import { checkStockTool } from "./sales/check-stock.tool.js";
import { getMsdsTool } from "./sales/get-msds.tool.js";

/**
 * Model-visible Sales capabilities. Adding a new Sales tool normally requires
 * only: create the tool file, then add one entry here.
 */
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

export const allTools = {
  ...salesTools,
  ...commonTools,
  ...knowledgeTools,
  searxngWebSearch: searxngWebSearchTool,
};
