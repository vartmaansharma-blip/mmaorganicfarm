# M'ma Organic Farm

Landing page for M'ma Organic Farm, focused on fresh farm milk delivery for
Jamshedpur homes.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Commerce responsibilities

- Shopify owns products, inventory, cart, checkout, payment status, and the
  commercial order.
- The active online catalog is limited to milk, paneer, and ghee. Glass
  bottles, papaya, and sweets are postponed and do not block checkout setup.
- Supabase owns customer delivery details, the weekly calendar, scheduled
  add-ons, skips, pauses, remaining deliveries, and farm operations.
- The website saves a pending Supabase delivery plan before creating a Shopify
  cart. The signed `orders/paid` Shopify webhook activates that saved plan.

Configure the Shopify values documented in `.env.example`, create an
`orders/paid` webhook pointing to
`/api/commerce/shopify/webhook`, and keep all Admin API and webhook secrets
server-side. Until Shopify is configured, the existing direct payment path is
retained as a temporary fallback.

`GET /api/commerce/shopify/status` reports whether the Storefront, signed
webhook, and server-side database connection are ready. It returns only missing
environment-variable names and never returns credential values.
