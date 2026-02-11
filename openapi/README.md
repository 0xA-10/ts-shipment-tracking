# OpenAPI Specifications

This directory contains OpenAPI specification files for carrier APIs.

## Available Specs

- ✅ **ups-tracking.yaml** - Downloaded from [UPS-API/api-documentation](https://github.com/UPS-API/api-documentation)
- ✅ **fedex-tracking.json** - Downloaded from [FedEx Developer Portal](https://developer.fedex.com/api/en-us/catalog/track/v1/docs.html)
- ✅ **usps-tracking.yaml** - Downloaded from [USPS Developer Portal](https://developers.usps.com/trackingv3r2)

## Updating Specs

To update the OpenAPI specifications when carrier APIs change:

### UPS
Download the latest spec from [UPS-API/api-documentation](https://github.com/UPS-API/api-documentation):
```bash
curl -L -o ups-tracking.yaml https://raw.githubusercontent.com/UPS-API/api-documentation/refs/heads/main/Tracking.yaml
```

### FedEx
1. Visit the [FedEx Developer Portal](https://developer.fedex.com/api/en-us/catalog/track/v1/docs.html)
2. Log in and download the latest Track API OpenAPI spec
3. Replace `fedex-tracking.json`

### USPS
1. Visit the [USPS Developer Portal](https://developers.usps.com/trackingv3r2)
2. Log in and download the latest Tracking v3.2 OpenAPI spec
3. Replace `usps-tracking.yaml`

## Generating Types

Once all specs are downloaded, run:

```bash
npm run generate:types
```

Or generate individually:

```bash
npm run generate:types:ups     # Already working
npm run generate:types:fedex   # Requires fedex-tracking.json
npm run generate:types:usps    # Requires usps-tracking.json
```

## Licensing & Terms of Service

These OpenAPI specifications are sourced from official carrier developer portals and are subject to each carrier's respective terms:

### UPS
- **Source:** [UPS-API/api-documentation](https://github.com/UPS-API/api-documentation)
- **Terms of Service:** https://www.ups.com/upsdeveloperkit/assets/html/serviceAgreement.html
- **File:** `ups-tracking.yaml`

### FedEx
- **Source:** [FedEx Developer Portal](https://developer.fedex.com/api/en-us/catalog/track/v1/docs.html)
- **Terms:** Governed by FedEx Developer Portal terms of use
- **File:** `fedex-tracking.json`

### USPS
- **Source:** [USPS Developer Portal](https://developers.usps.com/trackingv3r2)
- **Terms of Service:** https://about.usps.com/termsofuse.htm
- **Trademarks:** Contains USPS®, Priority Mail®, Priority Mail Express®, Media Mail®, Signature Confirmation™
- **File:** `usps-tracking.yaml`

### Usage Requirements

1. **Review Terms:** Users must review and comply with each carrier's API terms before integration
2. **Attribution:** Maintain proper trademark attribution (especially USPS trademarks)
3. **Purpose:** These specs are provided for the purpose of integrating with carrier APIs

### Repository License

This repository's code is licensed under the MIT License (see LICENSE file), but the OpenAPI specifications themselves remain subject to their respective carrier terms.
