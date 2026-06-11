# Customer Support Module

The support system is part of the platform, but it must not block the first commerce core loop.

## Required surfaces

- Storefront floating support entry on mobile, tablet, and desktop.
- Admin support workspace for tickets, order-linked conversations, SLA, and templates.
- Support service API with store-scoped conversations and audit logs.

## Planned channels

- Email-to-ticket
- Order support form
- Live chat widget
- Chatbot handoff
- Internal notes

## Responsive rule

The customer-facing widget must adapt across:

- Mobile: bottom floating button and full-screen drawer.
- Tablet: bottom floating button and side sheet.
- Desktop: bottom floating button and compact chat panel.

## Guardrails

- No PII in logs or DLQ payloads.
- Conversations must be tied to the deployed store and, when possible, an order or customer account.
- Order-linked tickets must not bypass order-service APIs.
- Chatbot responses must not promise refunds, shipping dates, or tax outcomes without backing data.
