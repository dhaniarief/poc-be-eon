# LE Mining Intelligence Agent - Usage

## Agent ID

Public REST agent ID:

```text
le-mining
```

REST endpoint:

```text
POST /api/agents/le-mining/chat
```

Mastra registered agents:

```text
leMiningLocal
leMiningCloud
```

Cloud Mastra/Teams agent ID:

```text
le-mining-cloud-agent
```

---

## 1. Install and validate

```powershell
npm install
npm run typecheck
npm test
```

If the Product Knowledge RAG schema has not yet been migrated to the Product-Knowledge-only design, back up the database and then run:

```powershell
npm run rag:migrate
npm run rag:sync:full
```

Verify Product Knowledge search:

```powershell
npm run rag:search -- "open gear ball mill"
npm run rag:search -- "industrial gearbox"
```

---

## 2. Start development server

```powershell
npm run dev
```

Default API base URL:

```text
http://localhost:3001
```

---

## 3. Create development JWT

Only when `.env.development` contains:

```env
ENABLE_DEV_TOKEN_ENDPOINT=true
```

PowerShell:

```powershell
$tokenResponse = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3001/api/auth/token" `
  -ContentType "application/json" `
  -Body (@{
    userId = "dev-user"
    name   = "Developer"
    role   = "IT"
  } | ConvertTo-Json)

$token = $tokenResponse.token
$headers = @{
  Authorization = "Bearer $token"
}
```

---

## 4. Ask the LE Mining agent

### Product recommendation

```powershell
$body = @{
  message = "Produk LE apa yang cocok untuk open gear ball mill?"
  modelMode = "cloud"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3001/api/agents/le-mining/chat" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

Expected tool flow:

```text
le-mining.knowledge
le-mining.products
```

### Find product document / PDF

Question:

```text
Kasih PDF atau SDS LE 9011.
```

Expected tool:

```text
le-mining.knowledge
```

### Find internal CRM customer

Question:

```text
Cari customer PT Freeport Indonesia di CRM.
```

Expected tool:

```text
le-mining.customers
```

### Find people at a CRM customer

Question:

```text
Cari contact maintenance di PT ABC.
```

Expected flow:

```text
le-mining.customers
le-mining.contacts
```

The agent resolves the CRM Account first and passes its accountId to the Contact tool.

### Public company/customer research

Question:

```text
Cari perkembangan terbaru perusahaan ABC dan project mining-nya.
```

Expected tool:

```text
le-mining.public-intelligence
```

### Public stakeholder research

Question:

```text
Cari informasi profesional maintenance manager di perusahaan ABC.
```

Expected tool:

```text
le-mining.public-intelligence
```

Public people are treated as stakeholder candidates/evidence, not automatically confirmed opportunity decision makers.

### Public LE product research

Question:

```text
Cari info publik terbaru Pyroshield 9011.
```

Expected tool:

```text
le-mining.web
```

This tool accepts results only from:

```text
eonchemicals.com
lelubricants.com
```

The unrestricted public-intelligence tool must not be used to bypass this product restriction.

---

## 5. Mastra Studio

Run:

```powershell
npm run studio
```

Then choose:

```text
leMiningLocal
```

or:

```text
leMiningCloud
```

Useful test prompts:

```text
Produk LE untuk industrial gearbox apa?
Cari success story Pyroshield 9011.
Cari customer PT ABC di CRM.
Cari orang maintenance di customer PT ABC.
Cari berita terbaru PT ABC tentang project mining.
Cari info publik LE 9011.
```

---

## 6. Teams

The cloud agent registers the Teams adapter as:

```text
le-mining-cloud-agent
```

For a separate Teams bot/app, the Mastra channel endpoint is expected to follow the existing pattern:

```text
/api/agents/le-mining-cloud-agent/channels/teams/webhook
```

Important: one Microsoft Bot registration has one messaging endpoint. If Sales Agent and LE Mining Agent must both live behind the same Teams bot identity, add an application-level dispatcher/router instead of trying to configure one Bot registration with two messaging endpoints.

---

## 7. Current source rules

### Product

Hard enforced by CRM backend:

```text
new_productfamily = 100000021
statecode = 0
new_industryproduct contains 100000002 OR 100000003
```

Meaning:

```text
Lubrication Engineers
Active
Mining East or Mining West
```

### Product Knowledge

Hard filtered to:

```text
Mining Contractor
Mining Owner
```

and source key:

```text
sharepoint:aidata:product-knowledge
```

### Customer

CRM Account lookup currently uses standard Dataverse fields.
It is not yet hard-filtered to Mining because the authoritative custom Account field for Mining classification has not been defined.

### People

CRM Contact lookup uses standard Contact fields and optional Account ID.

### Product public web

Allowed domains only:

```text
eonchemicals.com
lelubricants.com
```

### General public intelligence

Used only for non-product company, customer, stakeholder, mining project, market, and current-news research.
