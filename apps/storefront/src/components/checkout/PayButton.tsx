"use client";

import { useRouter } from "next/navigation";
import { paymentFailedAction, verifyPaymentAction, type PlaceResult } from "@/lib/actions/checkout";
import { track } from "@/lib/analytics-client";
import { loadRazorpay } from "./razorpay-loader";

/** Opens Razorpay Checkout for a placed order and verifies the result on the server. */
export function useRazorpayPay() {
  const router = useRouter();
  return async (placed: Extract<PlaceResult, { ok: true }>, fromCart: boolean, onMessage: (m: string) => void) => {
    await loadRazorpay();
    const rzp = new window.Razorpay!({
      key: placed.razorpay.keyId,
      order_id: placed.razorpay.orderId,
      amount: placed.razorpay.amount,
      currency: "INR",
      name: placed.razorpay.name,
      description: `Order ${placed.orderNumber}`,
      prefill: placed.razorpay.prefill,
      theme: { color: "#6d35d4" },
      handler: async (r) => {
        onMessage("Confirming your payment…");
        const v = await verifyPaymentAction({
          orderNumber: placed.orderNumber, token: placed.token, fromCart,
          razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature,
        });
        if (v.ok) {
          track("purchase", { valuePaise: placed.razorpay.amount });
          window.dispatchEvent(new Event("zentro:cart"));
          router.push(v.url);
        } else onMessage(v.error);
      },
      modal: { ondismiss: () => onMessage("Payment window closed. Your items are held for 30 minutes — you can pay again any time.") },
    });
    rzp.on("payment.failed", (r) => {
      void paymentFailedAction({ orderNumber: placed.orderNumber, token: placed.token, razorpayOrderId: placed.razorpay.orderId, razorpayPaymentId: r.error.metadata?.payment_id, code: r.error.code, description: r.error.description });
      onMessage(`Payment failed: ${r.error.description ?? "please try another method."}`);
    });
    rzp.open();
  };
}
