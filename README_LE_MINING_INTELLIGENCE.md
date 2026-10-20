# LE Mining Intelligence Agent

Agent ID: `le-mining`

## Scope

### Product intelligence
- CRM Product hard-filtered to:
  - Product Family `100000021` (Lubrication Engineers)
  - `statecode = 0` (Active)
  - Mining East `100000002` OR Mining West `100000003`
- SharePoint Product Knowledge filtered to Mining Contractor / Mining Owner
- Public product web restricted to:
  - eonchemicals.com
  - lelubricants.com

### Customer / company intelligence
- CRM Account lookup using standard Dataverse Account fields
- Public company/mining/project/current information through SearXNG
- Customer search is NOT yet hard-filtered to Mining because the authoritative custom Account mining field has not been defined.

### People / stakeholder intelligence
- CRM Contact lookup using standard Dataverse Contact fields
- Public professional/stakeholder research through SearXNG
- Public people are candidates/evidence, not automatically confirmed decision makers.

## Main endpoint

`POST /api/agents/le-mining/chat`

Authenticated with the same Bearer JWT as the existing agent endpoints.
