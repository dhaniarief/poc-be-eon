import { dynamicsGetAll } from "./crm-client.js";
import { escapeODataString } from "../../../utils/odata.util.js";
import { normalizeText } from "../../../utils/text.util.js";

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

type CrmRow = Record<string, unknown>;

function formatted(row: CrmRow, field: string) {
  return normalizeText(row[`${field}${FORMATTED}`]);
}

function clampLimit(value?: number) {
  return Math.max(1, Math.min(value ?? 10, 50));
}

function scoreText(query: string, ...values: Array<string | null | undefined>) {
  const needle = normalizeText(query).toLowerCase();
  if (!needle) return 1;

  const haystacks = values
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean);

  let score = 0;

  for (const value of haystacks) {
    if (value === needle) score = Math.max(score, 100);
    else if (value.startsWith(needle)) score = Math.max(score, 75);
    else if (value.includes(needle)) score = Math.max(score, 55);
  }

  const tokens = [...new Set(needle.split(/\s+/).filter((item) => item.length >= 2))];
  if (tokens.length > 0) {
    const combined = haystacks.join(" ");
    const matched = tokens.filter((token) => combined.includes(token));
    score += (matched.length / tokens.length) * 30;
  }

  return score;
}

export type LeMiningCustomer = {
  accountId: string;
  name: string;
  accountNumber: string | null;
  description: string | null;
  websiteUrl: string | null;
  telephone: string | null;
  city: string | null;
  stateOrProvince: string | null;
  country: string | null;
  industry: string | null;
  active: boolean;
};

type AccountRow = CrmRow & {
  accountid?: string;
  name?: string;
  accountnumber?: string;
  description?: string;
  websiteurl?: string;
  telephone1?: string;
  address1_city?: string;
  address1_stateorprovince?: string;
  address1_country?: string;
  industrycode?: number | null;
  statecode?: number;
};

export async function searchLeMiningCustomers(input: {
  query: string;
  limit?: number;
  activeOnly?: boolean;
  signal?: AbortSignal;
}) {
  const query = normalizeText(input.query);
  if (!query) throw new Error("Customer search query cannot be empty.");

  const limit = clampLimit(input.limit);
  const escaped = escapeODataString(query);

  const select = [
    "accountid",
    "name",
    "accountnumber",
    "description",
    "websiteurl",
    "telephone1",
    "address1_city",
    "address1_stateorprovince",
    "address1_country",
    "industrycode",
    "statecode",
  ].join(",");

  const searchFilter = [
    `name eq '${escaped}'`,
    `contains(name,'${escaped}')`,
    `accountnumber eq '${escaped}'`,
    `contains(accountnumber,'${escaped}')`,
  ].join(" or ");

  const filters = [`(${searchFilter})`];
  if (input.activeOnly === true) filters.push("statecode eq 0");

  const endpoint =
    `/api/data/v9.2/accounts` +
    `?$select=${select}` +
    `&$filter=${encodeURIComponent(filters.join(" and "))}` +
    `&$top=50`;

  const rows = await dynamicsGetAll<AccountRow>(endpoint, {
    signal: input.signal,
  });

  const ranked = rows
    .map((row) => {
      const customer: LeMiningCustomer = {
        accountId: normalizeText(row.accountid),
        name: normalizeText(row.name),
        accountNumber: normalizeText(row.accountnumber) || null,
        description: normalizeText(row.description) || null,
        websiteUrl: normalizeText(row.websiteurl) || null,
        telephone: normalizeText(row.telephone1) || null,
        city: normalizeText(row.address1_city) || null,
        stateOrProvince: normalizeText(row.address1_stateorprovince) || null,
        country: normalizeText(row.address1_country) || null,
        industry: formatted(row, "industrycode") || null,
        active: row.statecode === 0,
      };

      return {
        customer,
        score: scoreText(
          query,
          customer.name,
          customer.accountNumber,
          customer.description,
          customer.city,
          customer.industry,
        ),
      };
    })
    .filter((item) => item.customer.accountId && item.customer.name)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.customer.active !== b.customer.active) {
        return a.customer.active ? -1 : 1;
      }
      return a.customer.name.localeCompare(b.customer.name);
    });

  const customers = ranked.slice(0, limit).map((item) => item.customer);

  return {
    found: customers.length > 0,
    query,
    returned: customers.length,
    customers,
    note:
      "CRM customer search uses standard Account fields. Mining classification is not hard-filtered because the Account mining field has not been defined for this agent.",
  };
}

export type LeMiningContact = {
  contactId: string;
  fullName: string;
  jobTitle: string | null;
  email: string | null;
  telephone: string | null;
  mobilePhone: string | null;
  parentCustomerId: string | null;
  parentCustomerName: string | null;
  active: boolean;
};

type ContactRow = CrmRow & {
  contactid?: string;
  fullname?: string;
  firstname?: string;
  lastname?: string;
  jobtitle?: string;
  emailaddress1?: string;
  telephone1?: string;
  mobilephone?: string;
  _parentcustomerid_value?: string;
  statecode?: number;
};

export async function searchLeMiningContacts(input: {
  query?: string;
  customerId?: string;
  limit?: number;
  activeOnly?: boolean;
  signal?: AbortSignal;
}) {
  const query = normalizeText(input.query);
  const customerId = normalizeText(input.customerId);

  if (!query && !customerId) {
    throw new Error("Contact search requires query or customerId.");
  }

  const limit = clampLimit(input.limit);

  const select = [
    "contactid",
    "fullname",
    "firstname",
    "lastname",
    "jobtitle",
    "emailaddress1",
    "telephone1",
    "mobilephone",
    "_parentcustomerid_value",
    "statecode",
  ].join(",");

  const filters: string[] = [];

  if (query) {
    const escaped = escapeODataString(query);
    filters.push(
      `(` +
        [
          `fullname eq '${escaped}'`,
          `contains(fullname,'${escaped}')`,
          `contains(jobtitle,'${escaped}')`,
          `emailaddress1 eq '${escaped}'`,
        ].join(" or ") +
        `)`,
    );
  }

  if (customerId) {
    if (!/^[0-9a-fA-F-]{36}$/.test(customerId)) {
      throw new Error("Invalid customerId for contact search.");
    }
    filters.push(`_parentcustomerid_value eq ${customerId}`);
  }

  if (input.activeOnly === true) filters.push("statecode eq 0");

  const endpoint =
    `/api/data/v9.2/contacts` +
    `?$select=${select}` +
    `&$filter=${encodeURIComponent(filters.join(" and "))}` +
    `&$top=50`;

  const rows = await dynamicsGetAll<ContactRow>(endpoint, {
    signal: input.signal,
  });

  const ranked = rows
    .map((row) => {
      const contact: LeMiningContact = {
        contactId: normalizeText(row.contactid),
        fullName:
          normalizeText(row.fullname) ||
          `${normalizeText(row.firstname)} ${normalizeText(row.lastname)}`.trim(),
        jobTitle: normalizeText(row.jobtitle) || null,
        email: normalizeText(row.emailaddress1) || null,
        telephone: normalizeText(row.telephone1) || null,
        mobilePhone: normalizeText(row.mobilephone) || null,
        parentCustomerId: normalizeText(row._parentcustomerid_value) || null,
        parentCustomerName:
          formatted(row, "_parentcustomerid_value") || null,
        active: row.statecode === 0,
      };

      return {
        contact,
        score: query
          ? scoreText(
              query,
              contact.fullName,
              contact.jobTitle,
              contact.email,
              contact.parentCustomerName,
            )
          : 1,
      };
    })
    .filter((item) => item.contact.contactId && item.contact.fullName)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.contact.active !== b.contact.active) {
        return a.contact.active ? -1 : 1;
      }
      return a.contact.fullName.localeCompare(b.contact.fullName);
    });

  const contacts = ranked.slice(0, limit).map((item) => item.contact);

  return {
    found: contacts.length > 0,
    query,
    customerId: customerId || null,
    returned: contacts.length,
    contacts,
    note:
      "CRM Contact results are internal business-contact records. A contact is not automatically a confirmed decision maker for a specific opportunity.",
  };
}
