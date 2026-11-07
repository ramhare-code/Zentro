# Accessibility

Target: **WCAG 2.1 level AA** for both the storefront and the admin.

## Automated checks (run on every test run)

`tests/e2e/a11y.spec.ts` in each app runs [axe-core](https://github.com/dequelabs/axe-core) against WCAG 2.0/2.1 A and AA rules:

* **Storefront** (desktop and mobile): home, categories, a category, a product, search, cart, help, contact, a policy, feedback, sign-in, register, support, wishlist.
* **Admin** (desktop, signed in as owner): 29 pages covering every section, plus the sign-in page.

The audit found and fixed:

* faint text colour below 4.5:1 contrast (both apps)
* sidebar section headings below contrast
* the listing "Sort by" control without a name on phones
* buttons nested inside an expandable row on the categories page, plus arrow-only buttons without labels

## What automated checks can't prove — check by hand before launch

Automated tools catch roughly a third of real problems. Before launch, and after big design changes:

1. **Keyboard only:** unplug the mouse and complete a purchase (search → product → add to cart → checkout → pay). Every control must be reachable with Tab, the focus outline visible, and nothing must trap focus (menus, dialogs, the Razorpay window close with Esc).
2. **Screen reader:** with NVDA (Windows) or VoiceOver (iPhone/Mac), check that product cards, prices (incl. sale prices and MRP), star ratings, the cart count and form errors are announced sensibly.
3. **Zoom to 200%** and a 320 px wide screen: no text cut off, no sideways scrolling except tables.
4. **Reduced motion:** with “reduce motion” on, the homepage carousel doesn't auto-rotate.
5. **Images:** product images uploaded in the admin need meaningful alt text (the editor asks for it); banners require alt text.

## Writing content accessibly

* Use headings (`## …`) in pages and policies in order — don't skip levels.
* Link text should say where it goes (“returns policy”, not “click here”).
* Don't put important text only inside banner images; use the headline and sub-heading fields.
