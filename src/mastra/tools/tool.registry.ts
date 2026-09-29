import { getOpportunityOverviewTool } from "./crm/get-opportunity-overview.tool.js";
import { getOpportunityProductsTool } from "./crm/get-opportunity-products.tool.js";
import { getOpportunityActivitiesTool } from "./crm/get-opportunity-activities.tool.js";
import { getOpportunityStageTool } from "./crm/get-opportunity-stage.tool.js";
import { resolveOpportunityItemsTool } from "./finops/resolve-opportunity-items.tool.js";
import { checkStockAvailabilityTool } from "./finops/check-stock-availability.tool.js";
import { getSalesOrdersTool } from "./finops/get-sales-orders.tool.js";
import { getDeliveryStatusTool } from "./finops/get-delivery-status.tool.js";
import { getInvoicesTool } from "./finops/get-invoices.tool.js";
import { getDeliveryContextTool } from "./common/get-delivery-context.tool.js";
import { getRouteEstimateTool } from "./common/get-route-estimate.tool.js";
import { getOpportunityIntelligenceTool } from "./common/get-opportunity-intelligence.tool.js";
import { currentTimeTool } from "./common/current-time.tool.js";
import { getMsdsTool } from "./sharepoint/get-msds.tool.js";
import { webSearchTool as searxngWebSearchTool } from "./web/web-search.tool.js";
import { setActiveOpportunityTool } from "./common/set-active-opportunity.tool.js";
import { searchKnowledgeTool } from "./knowledge/search-knowledge.tool.js";

export const crmTools = {
  getOpportunityOverview: getOpportunityOverviewTool,
  getOpportunityProducts: getOpportunityProductsTool,
  getOpportunityActivities: getOpportunityActivitiesTool,
  getOpportunityStage: getOpportunityStageTool,
};

export const finopsTools = {
  resolveOpportunityItems: resolveOpportunityItemsTool,
  checkStockAvailability: checkStockAvailabilityTool,
  getSalesOrders: getSalesOrdersTool,
  getDeliveryStatus: getDeliveryStatusTool,
  getInvoices: getInvoicesTool,
};

export const commonTools = {
  currentTime: currentTimeTool,
  setActiveOpportunity: setActiveOpportunityTool,
  getOpportunityIntelligence: getOpportunityIntelligenceTool,
  getDeliveryContext: getDeliveryContextTool,
  getRouteEstimate: getRouteEstimateTool,
};

export const sharepointTools = {
  getMsds: getMsdsTool,
};

export const knowledgeTools = {
  searchKnowledge: searchKnowledgeTool,
};

/**
 * Studio registry. Cloud provider-native web search stays agent-scoped because
 * it is not a normal Mastra tool; Local SearXNG is registered globally.
 */
export const allTools = {
  ...crmTools,
  ...finopsTools,
  ...commonTools,
  ...sharepointTools,
  ...knowledgeTools,
  searxngWebSearch: searxngWebSearchTool,
};
