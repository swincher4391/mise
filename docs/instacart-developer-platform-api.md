# Instacart Developer Platform API Reference

> Source: https://docs.instacart.com/developer_platform_api/
> Documented: 2026-02-20

---

## Table of Contents

1. [Introduction](#introduction)
2. [Get Started](#get-started)
   - [Get an API Key](#get-an-api-key)
   - [Create a Recipe Page (Quick Start)](#create-a-recipe-page-quick-start)
3. [Concepts](#concepts)
   - [Shopping List Page](#shopping-list-page)
   - [Recipe Page](#recipe-page)
   - [Launch Activities](#launch-activities)
   - [Design Guidelines](#design-guidelines)
4. [Tutorials](#tutorials)
   - [Create a Recipe Page](#tutorial-create-a-recipe-page)
   - [Test Your Recipes](#test-your-recipes)
   - [Connect Your AI Agent with MCP](#connect-your-ai-agent-to-instacart-with-mcp)
   - [Filters](#filters)
5. [API Reference](#api-reference)
   - [Create Shopping List Page](#create-shopping-list-page)
   - [Create Recipe Page](#create-recipe-page)
   - [Get Nearby Retailers](#get-nearby-retailers)
   - [Units of Measurement](#units-of-measurement)
   - [API Security / Key Rotation](#api-security)
6. [Errors](#errors)
7. [FAQ](#faq)
8. [Terms and Policies](#terms-and-policies)
9. [Changelog](#changelog)

---

## Introduction

The Instacart Developer Platform provides APIs for building applications that leverage Instacart's network of retailers and shoppers. It enables custom shopping experiences, recipe functionality, and connects users to products from local stores.

> **Note:** This API is built for app developers. Retailers wanting Instacart fulfillment should use Instacart Connect APIs instead.

### What You Can Build

- **Recipe and meal planning applications** — recipe pages with ingredient matching and shopping list generation
- **Shopping list integrations** — smart shopping lists mapped to products at nearby retailers with real-time inventory/pricing
- **E-commerce integrations** — connect to Instacart Marketplace for seamless purchasing
- **Content and media platforms** — cooking shows, recipe websites with direct shopping capabilities

### API Suite Overview

| API Suite | Purpose | Key Use Cases |
|-----------|---------|---------------|
| **Shopping APIs** | Product discovery and cart creation | Recipe pages, shopping lists, product search |
| **Retailer APIs** | Store and location management | Find nearby stores, check availability, service areas |

---

## Get Started

### Integration Flow

1. **Request access & development key** — ~1 week
2. **Build integration & demo submission** — ~19 days (average benchmark)
3. **Demo approval & production key** — 1-2 business days

### Servers

| Environment | Base URL |
|-------------|----------|
| Development | `https://connect.dev.instacart.tools` |
| Production  | `https://connect.instacart.com` |

---

### Get an API Key

API keys authenticate requests to the Instacart Developer Platform.

#### Key Permissions

| Permission | Description |
|------------|-------------|
| Read-only | Access to retrieve data, cannot create or modify resources |
| Read-write | Full access to create, read, update resources |
| Admin | Full access including sensitive operations (use sparingly) |

#### Creating a Key

1. Log in to the Instacart Developer Dashboard
2. Navigate to **API Keys**
3. Click **Create New API Key**
4. Provide a descriptive name (e.g., "Development Environment")
5. Select **Development** or **Production**
6. Click **Generate Key**
7. **Copy and save the key immediately** — you cannot view it again after navigating away

#### API Key Format

```
keys.1234567890abcdef1234567890abcdef
```

- `keys.` — prefix identifying it as an Instacart key
- `1234567890abcdef1234567890abcdef` — unique identifier

#### Key Management

- View all active API keys in the Developer Dashboard
- See creation date and last-used timestamps
- Check permissions per key
- Monitor usage statistics

---

### Create a Recipe Page (Quick Start)

This quick start demonstrates creating a recipe page via the API.

#### API Endpoint

```
POST /idp/v1/products/recipe
```

#### Required Headers

```
Accept: application/json
Authorization: Bearer <API-key>
Content-Type: application/json
```

#### Example Request

```bash
curl --request POST \
  --url https://connect.instacart.com/idp/v1/products/recipe \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer <API-key>' \
  --header 'Content-Type: application/json' \
  --data '{
    "title": "Small Chocolate Cake (6 inches)",
    "image_url": "https://d3s8tbcesxr4jm.cloudfront.net/recipe-images/v3/small-chocolate-cake-6-inches/0_medium.jpg",
    "link_type": "recipe",
    "instructions": [
      "Preheat the oven to 350 degrees F and grease a 6-inch round cake pan.",
      "In a large bowl, combine flour, sugar, cocoa, baking powder, baking soda, salt, and cinnamon.",
      "Add egg, milk, oil, and vanilla to dry ingredients and mix well."
    ],
    "ingredients": [
      {
        "name": "whole milk",
        "display_text": "Whole milk",
        "measurements": [{ "quantity": 0.5, "unit": "cup" }]
      },
      {
        "name": "egg",
        "display_text": "Eggs",
        "measurements": [{ "quantity": 1, "unit": "large" }]
      },
      {
        "name": "ground cinnamon",
        "display_text": "Ground cinnamon",
        "measurements": [{ "quantity": 0.55, "unit": "teaspoon" }]
      }
    ],
    "landing_page_configuration": {
      "partner_linkback_url": "https://example.com/recipes",
      "enable_pantry_items": true
    }
  }'
```

#### Example Response

```json
{
  "products_link_url": "https://www.instacart.com/store/recipes/396179?aff_id=4204&offer_id=1&affiliate_platform=idp_partner"
}
```

#### Optional: Set a Preferred Retailer

1. Call `GET /idp/v1/retailers?postal_code=94105&country_code=US` to find nearby retailers
2. Select a `retailer_key` from the response
3. Append `?retailer_key=<key>` to the recipe URL

**URL Structure:**

| Component | Description | Example |
|-----------|-------------|---------|
| Base URL | Recipe page base | `https://www.instacart.com/store/recipes/` |
| Recipe ID | Unique identifier | `458050` |
| Retailer Key (optional) | Default retailer | `?retailer_key=sprouts` |

---

## Concepts

### Shopping List Page

The shopping list page enables flexible shopping list design across multiple North American store locations.

**Workflow:**
1. Identify products and add to `line_items` in API request
2. Receive a URL to the shopping list page
3. Users select stores and add items
4. Users proceed to checkout

**Key Fields:**
- `name` — required for product matching/search
- `display_text` — optional override for how the ingredient appears
- `line_item_measurements` — array supporting multiple unit options (e.g., cups and ounces)

---

### Recipe Page

Recipe pages enable shoppable recipes across lifestyle preferences. The page includes:

- Header with title and image
- Store selector (showing retailers carrying 40%+ of ingredients)
- Ingredients section with available item tiles
- "You may already have" pantry suggestions
- Full ingredient list with measurements
- Step-by-step instructions

#### URL Caching Best Practices

| Scenario | Cache Strategy | Recommended Expiry |
|----------|---------------|-------------------|
| Static recipes (unchanging) | Cache returned URLs | > 31 days |
| Customizable recipes (per-user) | Cache per customization | < 14 days |

#### Ingredient Matching Guidelines

- Use generic product names (no weight/brand specifics in `name`)
- Use `display_text` for preparation descriptions (e.g., "diced onion")
- Provide multiple measurement units for better matching
- Available health filters: `ORGANIC`, `GLUTEN_FREE`, `VEGAN`, `KOSHER`, `FAT_FREE`, `SUGAR_FREE`, `LOW_FAT`

---

### Launch Activities

#### Overview

Three steps to prepare for launch:
1. **(Optional)** Sign up for conversion tracking and affiliate payments
2. **(Required)** Complete the pre-launch checklist
3. **(Required)** Start the approval process

#### Conversion Tracking and Affiliate Payments

Managed through **Impact** (affiliate marketing platform). Impact tracks conversions and pays commissions for orders attributed to your integration.

**Appending Attribution Parameters:**

Add the following to existing recipe/shopping list URLs:
```
?utm_campaign=instacart-idp&utm_medium=affiliate&utm_source=instacart_idp&utm_term=partnertype-mediapartner&utm_content=campaignid-20313_partnerid-<your-partner-id>
```

Newly created links automatically include these parameters.

#### Pre-Launch Checklist

Before requesting a Production API key:
- [ ] Active Instacart Enterprise Service Desk account
- [ ] 100% compliance with Developer Platform terms and conditions
- [ ] All requests formatted per API specification
- [ ] Error handling for all implemented endpoints

#### Approval Process

1. Request a Production API key (triggers automatic review)
2. Key shows "Pending approval" status during review
3. Instacart evaluates against criteria:
   - Terms compliance
   - API specification adherence
   - Error handling implementation
   - Active support account
   - (For affiliates) Tastemakers account and correct developer ID
4. **Approval** → email notification, key activated, Impact.com invitation
5. **Denial** → contact Technical Support, address issues, resubmit

---

### Design Guidelines

#### CTA (Call to Action) Design

Three button variants:

| Variant | Background | Text Color | Stroke |
|---------|-----------|------------|--------|
| **Dark** | `#003D29` | `#FAF1E5` | None |
| **Light** | `#FAF1E5` | `#003D29` | `#EFE9E1` (0.5px) |
| **White** | `#FFFFFF` | `#000000` | `#E8E9EB` (0.5px) |

**Common specs for all variants:**
- Button height: 46px
- Button width: dynamic (based on text)
- Logo size: 22px
- Padding: 16px vertical, 18px horizontal
- Logo colors: `#FF7009` (orange) and `#0AAD0A` (green)
- Recommended text: "Shop ingredients" or "Shop on Instacart"

#### CTA Placement

- Add ample padding around the CTA
- Position the Instacart CTA alongside your existing CTA buttons
- Follow Instacart's design guidelines

#### Instacart Logos

- Download `Instacart_logos.zip` from the docs
- Minimum size on screen: 14px; in print: 0.25 inches
- Logo only on white, cashew, or dark kale backgrounds
- Maintain required clearspace around logo

---

## Tutorials

### Tutorial: Create a Recipe Page

**Endpoint:** `POST /idp/v1/products/recipe`

**Prerequisites:** Development API key, development server URL

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Recipe page title |
| `image_url` | string | No | 500x500 image URL |
| `instructions` | string[] | No | Step-by-step preparation steps |
| `ingredients` | LineItem[] | Yes | Ingredient list with measurements |
| `partner_linkback_url` | string | No | Return link to your site |
| `enable_pantry_items` | boolean | No | Show pantry item suggestions |

**Response:** Returns `products_link_url` pointing to the hosted recipe page on Instacart Marketplace.

---

### Test Your Recipes

Four testing areas:

1. **User Journey** — verify URLs follow format `www.instacart.com/store/recipes/<id>` and pages load correctly
2. **Ingredient Matching** — review ingredients for accuracy across different workflows (bulk-created, custom per-user, user-input)
3. **Order Delivery** — add items to cart, checkout, confirm delivery
4. **Order Attribution** — check Tastemakers account for updated order counts (may take several hours)

---

### Connect Your AI Agent to Instacart with MCP

The Model Context Protocol (MCP) allows AI agents to interact with Instacart's APIs.

#### MCP Server Endpoints

| Environment | URL |
|-------------|-----|
| Development | `https://mcp.dev.instacart.tools/mcp` |
| Production  | `https://mcp.instacart.com/mcp` |

#### Prerequisites

- Development API key
- AI agent supporting MCP client libraries
- (Optional) MCP Inspector for testing

#### Available MCP Tools

- **create-recipe** — create recipe pages with ingredients, instructions, measurements
- **create-shopping-list** — generate shopping lists for grocery items

#### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

1. Configure with Streamable HTTP transport type
2. Set the MCP server URL
3. Add API key as Bearer Token in Authorization header
4. List tools to verify `create-recipe` and `create-shopping-list` are available

---

### Filters

Apply brand and health filters to recipe pages and shopping lists.

#### Filter Object

| Field | Type | Description |
|-------|------|-------------|
| `brand_filters` | string[] | Case-sensitive brand names |
| `health_filters` | string[] | Health attribute filters |

#### Available Health Filters

`ORGANIC`, `GLUTEN_FREE`, `FAT_FREE`, `VEGAN`, `KOSHER`, `SUGAR_FREE`, `LOW_FAT`

#### Guidelines

- Recommended: 10 or fewer filters per item
- Brand names and health options are case-sensitive and must match exactly as displayed on Instacart
- If requested brands aren't available, Instacart suggests alternatives matching the product name

---

## API Reference

### Create Shopping List Page

**Endpoint:** `POST /idp/v1/products/products_link`

Creates a shareable shopping list on Instacart Marketplace.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Shopping list title |
| `line_items` | LineItem[] | Yes | Products to include |
| `image_url` | string | No | 500x500 image URL |
| `link_type` | string | No | `shopping_list` (default) or `recipe` |
| `expires_in` | integer | No | Days until expiration (max 365) |
| `instructions` | string[] | No | Additional context |
| `landing_page_configuration` | object | No | Page settings |

#### LineItem Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Product name for search matching |
| `quantity` | number | No | Count or measurement (default: 1.0) |
| `unit` | string | No | Measurement unit (default: `each`) |
| `display_text` | string | No | Custom display name |
| `product_ids` | integer[] | No | Specific product identifiers |
| `upcs` | string[] | No | Universal Product Codes (12-14 digits) |
| `line_item_measurements` | Measurement[] | No | Multiple measurement options |
| `filters` | Filter | No | Brand and health filters |

#### Landing Page Configuration

| Field | Type | Description |
|-------|------|-------------|
| `partner_linkback_url` | string | Return link to your site |
| `enable_pantry_items` | boolean | Show pantry item suggestions |

#### Response (200 OK)

```json
{
  "products_link_url": "http://example.com"
}
```

#### Error Responses

| Code | Description |
|------|-------------|
| 400 | Missing required parameters or validation errors |
| 1001 | Invalid filters, quantities, or duplicate product identifiers |

#### Code Examples

Available in: cURL, Java, Python, Go

---

### Create Recipe Page

**Endpoint:** `POST /idp/v1/products/recipe`

Creates a recipe page on Instacart Marketplace with ingredients, instructions, and a shareable link.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Recipe name |
| `ingredients` | LineItem[] | Yes | Ingredient list |
| `image_url` | string | No | 500x500 image URL |
| `author` | string | No | Recipe author |
| `servings` | string | No | Number of servings |
| `cooking_time` | string | No | Preparation/cooking time |
| `external_reference_id` | string | No | External ID reference |
| `content_creator_credit_info` | object | No | Content creator attribution |
| `expires_in` | integer | No | Days until expiration (max 365, default 30) |
| `instructions` | string[] | No | Step-by-step preparation |
| `landing_page_configuration` | object | No | Page settings |

#### Measurement Object

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `quantity` | number | 1.0 | Item count or measurement value |
| `unit` | string | `each` | Measurement unit |

#### Response (200 OK)

```json
{
  "products_link_url": "https://www.instacart.com/store/recipes/<id>?..."
}
```

#### Best Practices

- Cache generated URLs; reuse unless recipes change
- Only submit supported units of measurement
- Prioritize UPC searches for accurate matching
- Multiple UPCs serve as fallback; first UPC determines retailer ranking

---

### Get Nearby Retailers

**Endpoint:** `GET /idp/v1/retailers`

Returns nearby retailers based on postal code and country.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `postal_code` | string | Yes | US or Canadian postal code |
| `country_code` | string | Yes | `US` or `CA` |

#### Response (200 OK)

```json
{
  "retailers": [
    {
      "retailer_key": "test-retailer",
      "name": "Test Retailer",
      "retailer_logo_url": "www.logoUrl.com"
    }
  ]
}
```

#### Retailer Object

| Field | Type | Description |
|-------|------|-------------|
| `retailer_key` | string | Unique retailer identifier |
| `name` | string | Retailer name |
| `retailer_logo_url` | string | Retailer logo URL |

---

### Units of Measurement

Use the `Measurement` object to provide multiple ways to measure an item.

#### Volume-Based Units

| Unit | Example Items |
|------|---------------|
| `cup` | walnuts, heavy cream, rolled oats |
| `fluid_ounce` | oils, soups, broths |
| `gallon` | milk, water |
| `milliliter` | milk, juices |
| `liter` | water, juice |
| `pint` | ice cream |
| `quart` | ice cream |
| `tablespoon` | oils, seasonings |
| `teaspoon` | spices |

#### Weight-Based Units

| Unit | Example Items |
|------|---------------|
| `gram` | rice noodles |
| `kilogram` | meats |
| `pound` | potatoes, flour, produce |
| `ounce` | cereal, produce |

#### Countable Units

| Unit | Example Items |
|------|---------------|
| `each` | produce items |
| `bunch` | vegetables |
| `can` | produce |
| `ear` / `ears` | corn |
| `head` / `heads` | lettuce |
| `large` / `medium` / `small` | eggs, produce |
| `package` / `packet` | prepared foods |

> **Tip:** For countable items (e.g., tomatoes), use `each` rather than specifying a weight.

---

### API Security

#### Key Rotation Process

1. Create a new API key
2. Update applications to use the new key
3. Verify functionality
4. Delete the old key from the dashboard

#### Revoking Keys

Navigate to **API Keys** in the Developer Dashboard, select the key, and confirm revocation. Revoking immediately stops all requests using that key.

#### Security Best Practices

- Store keys in environment variables or secure configuration management
- Never commit keys to version control
- Maintain separate keys per environment (dev/staging/prod)
- Limit permissions to the minimum necessary scope
- Use distinct keys across different applications
- Regularly audit active keys
- Monitor usage patterns and set up anomaly alerts

**Support:** developer-support@instacart.com

---

## Errors

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Check required parameters and syntax |
| 401 | Unauthorized | Invalid access token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Verify resource ID |
| 408 | Request Timeout | Server closed idle connection |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Retry later |
| 503 | Service Unavailable | Server overloaded or maintenance |

### Error Response Format

**Single error:**
```json
{
  "error": {
    "message": "Error description",
    "code": 1001
  },
  "meta": {
    "key": "associated_parameter"
  }
}
```

**Multiple errors:**
```json
{
  "error": {
    "code": 9999,
    "errors": [
      {
        "message": "First error",
        "code": 1001,
        "meta": { "key": "param1" }
      }
    ]
  }
}
```

### Error Codes

| Code | Meaning |
|------|---------|
| 1001 | Invalid parameter |
| 2003 | Retry later |
| 4000 | Record not found |
| 4001 | Invalid request |
| 4002 | Failed context resolution |
| 500x | Internal server issues |
| 9999 | Multiple errors (wrapper) |

---

## FAQ

**Deep Linking:** URLs from Create shopping list and Create recipe page endpoints support deep linking, opening the native Instacart app on iOS and Android.

**Brand Filtering:** Add only brand names in `brand_filters`; place product names in the `LineItem` object. If requested brands aren't available, Instacart suggests alternatives.

**API Key Access:** Two endpoints exist (`/products/products_link` and `/products/recipe`). Initial API keys may only access one endpoint; create multiple keys for different endpoints.

**Cart Quantities:** When quantities appear incorrect, check for unit mismatches. Instacart attempts to match quantities but cannot guarantee accuracy.

**SKU Numbers:** Not currently supported. Use brand and health filters for product matching.

**Measurement Units:** Supports various units including cups, teaspoons, and other liquid measurements beyond ounces/pounds.

**Multiple Retailers:** Users can add items from multiple retailers; each maintains a separate cart (fulfilled as distinct orders).

**Merchant Selection:** Cannot direct users to specific merchants. Instacart displays defaults based on location, product availability, and user preferences.

---

## Terms and Policies

### Terms and Conditions (Summary)

- **License:** Limited, non-transferable, non-sublicensable, non-exclusive, revocable license during term
- **Key restrictions:** No sharing API keys with third parties; no scraping; no competing products; no displaying priced items from multiple retailers on same screen
- **Data use:** Prohibited from using interaction data for user profiling, targeting, or building competing products
- **API limits:** Instacart sets and enforces usage limits; written approval needed for increases
- **Monitoring:** Instacart monitors access to ensure compliance; may suspend access without notice
- **Liability cap:** $100 USD aggregate
- **Termination:** Instacart may terminate or suspend at any time
- **Arbitration:** Disputes resolved via JAMS (US) or ICDR Canada (CA) after mandatory 60-day informal resolution period
- **Governing law:** Delaware (US), Ontario (CA), or Quebec (QC residents)

### Developer Guidelines (Summary)

- **Safety:** Apps must promote safe, positive experiences without causing harm
- **Respect:** No objectionable, illegal, harmful, or discriminatory content; respect IP and privacy rights
- **Transparency:** Accurate claims, clear disclosure of functionality and data usage, explicit user consent
- **Compliance:** Follow all applicable laws; no targeting users under 18 (or 21 for alcohol-related content)
- **Enforcement:** Instacart may suspend or deactivate access for violations

### Developer Messaging Guidelines (Summary)

- All public communications about your integration require Instacart approval (5 business days review)
- Do not refer to Instacart as your "Partner" or the relationship as a "Partnership"
- Do not use Instacart's press release boilerplate
- Do not use "Free Delivery" — use "$0 Delivery Fee" or "No Delivery Fee" with "Service fees apply." disclaimer
- Use "Delivery in as fast as one hour" for delivery speed claims
- Correct phrases: "Delivery via/through Instacart", "Instacart delivery"
- Incorrect phrases: "Instacart delivers", "Instacart does the shopping"
- Media inquiries: flag to press@instacart.com before responding

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-04 | Updated CTA button designs with refreshed visuals from A/B testing |
| 2026-01-06 | Enhanced Create shopping list page docs (prerequisites, UPC info, best practices) |
| 2025-11-12 | Updated API key structure documentation |
| 2025-10-23 | Reorganized Get started section; moved recipe page tutorial and API keys docs |
| 2025-09-18 | Added UPC identifier support in line items |
| 2025-09-18 | Added MCP tutorial for AI agent integration |
| 2025-08-06 | Added concepts for display text customization and measurements |
| 2025-04-17 | Added Get Nearby Retailers API; preferred retailer option for recipes |
| 2025-01-14 | Renamed "Specify preferred brands" to Filters; added health_filters |
| 2024-07-22 | Launched self-service dashboard for API key management |
| 2024-05-07 | Introduced Create recipe page endpoint |
| 2024-03-27 | **Launched Instacart Developer Platform for public use** |

> All changes are non-breaking.
