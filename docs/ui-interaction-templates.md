# UI Interaction Templates

All new storefront and admin pages must reuse these interaction patterns. Do not create one-off buttons, dialogs, loading states, empty states, or form layouts unless this document is updated first.

## Storefront

- Header: premium minimal, white background, thin line, compact desktop navigation, icon-led mobile drawer.
- Language and market selectors: text/dropdown pattern, no mismatched round badges.
- Buttons: black primary button, thin-border secondary button, minimum touch target 44px.
- Loading: use the teaware line-art pouring animation for checkout, buy-now, payment, registration, tracking, and review submission waits.
- Legal pages: use `LegalPageShell`, one shared layout, English content by default, footer links to the other policy pages.
- Payment result pages: use `PaymentResultShell`, no ad-hoc success/failure screens.
- Forms: explicit error state, no silent failure, no fake save.
- Cookie: bottom banner, accept/manage actions, later tied to backend consent categories.

## Admin

- Page shell: `AdminPanel`.
- Repeated item: `AdminListCard`.
- Inputs: `AdminTextInput`, `AdminNumberInput`, `AdminTextarea`, `AdminSelect`, `AdminCheckbox`, `AdminFileInput`.
- Actions: `AdminPrimaryButton`, `AdminSecondaryButton`, `AdminToggleButton`.
- Status: `AdminInlineStatus` or `AdminStatusBadge`.
- Destructive actions: use a confirmation dialog before deletion, discard, or bulk operations.
- Async operations: show progress text and final explicit success/failure. Never use a button click that silently fails.
- Empty states: explain whether the module has no data or the API is not connected.

## Modal and Drawer Rules

- Use a shared overlay style: fixed inset, black translucent backdrop, white content panel, no nested cards.
- ESC and backdrop close must be supported for non-destructive dialogs.
- Confirmation dialogs must name the action and target.
- Mobile drawers must be full-height, scrollable, and at most 90vw.
- Dialog buttons must keep primary action on the right on desktop and stacked on mobile.

## Lists and Pagination

- All backend lists must be paginated.
- List filters must be horizontal and compact on desktop, stacked on mobile.
- Do not load all records into a page.
- Use status labels from the domain state, not free-form colors.

## Media

- Product images must use URLs plus metadata only.
- Do not store base64 images in JSON.
- Large images, GIFs, and videos must lazy-load; videos preload metadata only.
- Upload pages must show validation errors for MIME, size, and missing object-storage configuration.
