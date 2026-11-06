// ---------------------------------------------------------------------
// DRAFT POLICY TEXT — have these reviewed by a qualified legal adviser
// before launch and adjust them to how your business actually operates.
// {business}, {email}, {returnDays} are filled from configuration.
// ---------------------------------------------------------------------

export interface Policy {
  title: string;
  summary: string;
  sections: { heading: string; body: string }[];
}

export const POLICIES: Record<string, Policy> = {
  returns: {
    title: "Returns & refunds",
    summary: "How to return a product and when you will receive your refund.",
    sections: [
      { heading: "Return window", body: "Most products can be returned within {returnDays} days of delivery. The product page shows if an item is not returnable (for example, hygiene or personalised products)." },
      { heading: "Condition", body: "Items must be unused, in their original packaging, with all tags, accessories and freebies included. Damaged, defective or wrong items can always be returned within the window." },
      { heading: "How to request a return", body: "Open My Orders, select the delivered order and choose Request return. Tell us the reason and, where relevant, add photos. We will confirm pickup or drop-off details." },
      { heading: "Refunds", body: "Once the returned item is received and checked, we issue the refund to your original payment method. You can follow the refund status on the order page. Banks typically take 5–7 working days to credit it." },
      { heading: "Cancellations", body: "You can cancel an order from the order page until it is packed. Prepaid cancellations are refunded in full to the original payment method." },
    ],
  },
  shipping: {
    title: "Shipping & delivery",
    summary: "Where we deliver, delivery charges and timelines.",
    sections: [
      { heading: "Delivery areas", body: "We deliver to serviceable pincodes across India. Enter your pincode at checkout to confirm delivery and see the estimated delivery date." },
      { heading: "Charges", body: "Delivery charges, if any, are calculated from your delivery address and order value, and are shown before you pay." },
      { heading: "Tracking", body: "When your order ships you will receive the carrier name and tracking number by email, and can track it from My Orders." },
      { heading: "Failed delivery", body: "If the carrier cannot deliver after repeated attempts, the order returns to us and we refund the amount paid, minus any non-refundable charges stated at checkout." },
    ],
  },
  privacy: {
    title: "Privacy policy",
    summary: "What personal data {business} collects, why, and your rights.",
    sections: [
      { heading: "What we collect", body: "Account details (name, email, phone), delivery addresses, order and payment status, support conversations, and basic technical data needed to run the site securely. Card, UPI and bank details are handled by our payment partner and are never stored by us." },
      { heading: "Why we use it", body: "To process and deliver orders, provide customer support, prevent fraud, meet tax and legal obligations, and — only if you opt in — to send offers." },
      { heading: "Sharing", body: "We share only what is necessary with service providers who help us operate: payment processing, delivery partners, email/SMS delivery and hosting. We do not sell personal data." },
      { heading: "Cookies and analytics", body: "Essential cookies keep your cart and sign-in working. With your permission we also set a first-party analytics cookie (a random ID) to count visits and understand which pages are useful. We don’t store your IP address for analytics, and the data is never shared with advertisers. You can change your choice any time with “Cookie settings” at the bottom of every page. Analytics data is deleted after 13 months." },
      { heading: "Retention", body: "We keep order and invoice records for as long as tax law requires. Other data is deleted when no longer needed or when you delete your account." },
      { heading: "Your rights", body: "You can access and correct your information from your account, withdraw marketing consent at any time, and delete your account. For any privacy request contact {email}." },
    ],
  },
  terms: {
    title: "Terms of use",
    summary: "The terms that apply when you shop with {business}.",
    sections: [
      { heading: "Orders", body: "An order is confirmed only after payment is successfully verified. We may cancel an order and refund in full if a product is unavailable, mispriced due to an obvious error, or the order appears fraudulent." },
      { heading: "Prices", body: "Prices are in Indian Rupees and include applicable GST. Delivery charges and any discounts are shown at checkout before payment." },
      { heading: "Product information", body: "We take care to describe products accurately. Colours may vary slightly by screen. If an item is not as described you may return it under our returns policy." },
      { heading: "Accounts", body: "Keep your login details confidential. You are responsible for activity on your account. You may delete your account at any time." },
      { heading: "Reviews", body: "Reviews may be posted only by customers who bought the product. Reviews are moderated for abuse and spam; we never edit ratings or remove genuine negative reviews." },
      { heading: "Contact", body: "Questions about these terms can be sent to {email}." },
    ],
  },
};
