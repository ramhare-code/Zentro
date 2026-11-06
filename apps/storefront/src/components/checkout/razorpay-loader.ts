"use client";

export interface RazorpayOptions {
  key: string; order_id: string; amount: number; currency: "INR"; name: string; description?: string;
  prefill: { name: string; email: string; contact: string };
  theme?: { color: string };
  handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
}
interface RazorpayInstance { open(): void; on(event: "payment.failed", cb: (r: { error: { code?: string; description?: string; metadata?: { payment_id?: string } } }) => void): void }
declare global { interface Window { Razorpay?: new (o: RazorpayOptions) => RazorpayInstance } }

let loading: Promise<void> | null = null;
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("Could not load the payment window. Check your connection.")); };
    document.head.appendChild(s);
  });
  return loading;
}
