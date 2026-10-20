# LE Mining - Useful Queries

## 1. CRM - LE + Active products

```text
https://eonchemicals1.crm5.dynamics.com/api/data/v9.2/products?$select=productid,name,productnumber,description,new_productfamily,new_industryproduct,statecode,statuscode,_defaultuomid_value,_defaultuomscheduleid_value&$filter=new_productfamily%20eq%20100000021%20and%20statecode%20eq%200&$orderby=name%20asc
```

Mandatory backend constants:

- LE Product Family = `100000021`
- Active State = `0`
- Mining East = `100000002`
- Mining West = `100000003`

The production service re-checks all three conditions in code before returning any product.

## 2. CRM - fully server-filtered Mining query using ContainValues

Readable form:

```text
/api/data/v9.2/products
?$select=productid,name,productnumber,description,new_productfamily,new_industryproduct,statecode,statuscode
&$filter=new_productfamily eq 100000021
  and statecode eq 0
  and (
    Microsoft.Dynamics.CRM.ContainValues(
      PropertyName=@p1,
      PropertyValues=@p2
    )
    or
    Microsoft.Dynamics.CRM.ContainValues(
      PropertyName=@p1,
      PropertyValues=@p3
    )
  )
&@p1='new_industryproduct'
&@p2=['100000002']
&@p3=['100000003']
&$orderby=name asc
```

Browser form:

```text
https://eonchemicals1.crm5.dynamics.com/api/data/v9.2/products?$select=productid,name,productnumber,description,new_productfamily,new_industryproduct,statecode,statuscode&$filter=new_productfamily%20eq%20100000021%20and%20statecode%20eq%200%20and%20(Microsoft.Dynamics.CRM.ContainValues(PropertyName=@p1,PropertyValues=@p2)%20or%20Microsoft.Dynamics.CRM.ContainValues(PropertyName=@p1,PropertyValues=@p3))&@p1='new_industryproduct'&@p2=['100000002']&@p3=['100000003']&$orderby=name%20asc
```

## 3. CRM - Industry metadata

```text
https://eonchemicals1.crm5.dynamics.com/api/data/v9.2/EntityDefinitions(LogicalName='product')/Attributes(LogicalName='new_industryproduct')/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet
```

## 4. SharePoint - Product Knowledge fields

```text
https://eonchemicals1.sharepoint.com/sites/aidata/_api/web/lists(guid'3c6e2865-ecf6-4ce7-ad34-98481dceb7de')/fields?$select=Title,InternalName,TypeAsString&$filter=Hidden%20eq%20false
```

Expected business fields:

- `Category`
- `ProductName`
- `IndustryType`
- `Application`
- `Equipment`

## 5. SharePoint - Product Knowledge items

```text
https://eonchemicals1.sharepoint.com/sites/aidata/_api/web/lists(guid'3c6e2865-ecf6-4ce7-ad34-98481dceb7de')/items?$select=ID,FileLeafRef,FileRef,Category,ProductName,IndustryType,Application,Equipment,Modified&$orderby=Modified%20desc&$top=100
```

## 6. PostgreSQL - source summary

```sql
SELECT
    source_key,
    COUNT(*) AS documents,
    COUNT(*) FILTER (WHERE is_searchable) AS searchable_documents
FROM rag.documents
GROUP BY source_key
ORDER BY source_key;
```

## 7. PostgreSQL - Mining Product Knowledge

```sql
SELECT
    id,
    title,
    category,
    product_name,
    industry_types,
    applications,
    equipment,
    source_url
FROM rag.documents
WHERE is_searchable = TRUE
  AND industry_types && ARRAY['Mining Contractor', 'Mining Owner']::TEXT[]
ORDER BY title;
```

## 8. PostgreSQL - find product/application/equipment

```sql
SELECT
    title,
    product_name,
    category,
    industry_types,
    applications,
    equipment,
    source_url
FROM rag.documents
WHERE is_searchable = TRUE
  AND (
      LOWER(COALESCE(product_name, '')) LIKE '%pyroshield%'
      OR EXISTS (
          SELECT 1
          FROM UNNEST(applications) AS a
          WHERE LOWER(a) LIKE '%open gear%'
      )
      OR EXISTS (
          SELECT 1
          FROM UNNEST(equipment) AS e
          WHERE LOWER(e) LIKE '%ball mill%'
      )
  )
ORDER BY title;
```

## 9. PostgreSQL - confirm SOP/IK is gone

```sql
SELECT COUNT(*) AS legacy_sop_documents
FROM rag.documents
WHERE source_key = 'sharepoint:mis-sopik:sitepages';
```

Expected result: `0`.

## 10. Test LE Mining agent through REST

```http
POST /api/agents/le-mining/chat
Content-Type: application/json
Authorization: Bearer <token>

{
  "message": "Produk LE apa yang cocok untuk open gear ball mill?",
  "modelMode": "cloud"
}
```

Expected tools:

1. `le-mining.knowledge`
2. `le-mining.products`

For public research:

```json
{
  "message": "Cari informasi publik terbaru tentang Pyroshield 9011",
  "modelMode": "cloud"
}
```

Expected tool: `le-mining.web` and every returned URL must belong to `eonchemicals.com` or `lelubricants.com`.
