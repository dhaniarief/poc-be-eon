export type CRMOpportunityDeliverySource = {
  opportunityid?: string;
  new_noopp?: string;
  new_deliverypointharussamadenganygdisordelive?: string | null;
  "new_deliverypointharussamadenganygdisordelive@OData.Community.Display.V1.FormattedValue"?: string;
  new_shippingaddress?: string | null;
  _new_destinationid_value?: string | null;
  "_new_destinationid_value@OData.Community.Display.V1.FormattedValue"?: string;
  new_regencyxd?: string | null;
  "new_regencyxd@OData.Community.Display.V1.FormattedValue"?: string;
  new_zona?: string | null;
  "new_zona@OData.Community.Display.V1.FormattedValue"?: string;
};

export type FinOpsOperationalSiteSource = {
  SiteId?: string;
  SiteName?: string;
  FormattedPrimaryAddress?: string;
  PrimaryAddressStreet?: string;
  PrimaryAddressStreetNumber?: string;
  PrimaryAddressDistrictName?: string;
  PrimaryAddressCity?: string;
  PrimaryAddressStateId?: string;
  PrimaryAddressZipCode?: string;
  PrimaryAddressCountryRegionId?: string;
  PrimaryAddressLatitude?: number;
  PrimaryAddressLongitude?: number;
};
