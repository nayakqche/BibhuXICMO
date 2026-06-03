import { LegalPage } from "@/frontend/components/marketing/legal-page";
import { CONTACT, SITE_NAME, mailto } from "@/shared/legal";

export const metadata = {
  title: "Refund Policy",
  description: `Cancellation and refund terms for ${SITE_NAME} subscriptions.`,
};

export default function RefundPage() {
  return (
    <LegalPage title="Refund Policy">
      <p>
        We want you to be confident in {SITE_NAME}. This policy explains how refunds and
        cancellations work for paid subscriptions.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">7-day money-back guarantee</h2>
      <p>
        If you are not satisfied with a paid (Max) plan within the first <strong>7 days</strong>{" "}
        of your initial subscription, email{" "}
        <a href={mailto(CONTACT.billing)} className="text-primary hover:underline">
          {CONTACT.billing}
        </a>{" "}
        from the address on your account. We will issue a full refund — no questions asked.
        Refunds are processed through Stripe and typically appear within 5–10 business days.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">After 7 days</h2>
      <p>
        Subscriptions are non-refundable after the 7-day window. You may cancel at any time from
        the <a href="/billing">Billing</a> page. Cancellation stops future charges; access
        continues until the end of the current billing period.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Credits</h2>
      <p>
        Monthly credits included in your plan do not roll over and are not refundable separately
        from the subscription. Purchased credit top-ups, if offered, are final unless required by
        applicable law.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Downgrades</h2>
      <p>
        Downgrading takes effect at the next billing cycle. You keep Max-plan access until the
        current period ends.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Contact</h2>
      <p>
        Billing questions:{" "}
        <a href={mailto(CONTACT.billing)} className="text-primary hover:underline">
          {CONTACT.billing}
        </a>
      </p>
    </LegalPage>
  );
}
