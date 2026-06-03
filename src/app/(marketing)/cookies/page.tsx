import { LegalPage } from "@/frontend/components/marketing/legal-page";
import { CONTACT, SITE_NAME, mailto } from "@/shared/legal";

export const metadata = {
  title: "Cookie Policy",
  description: `How ${SITE_NAME} uses cookies and similar technologies.`,
};

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy">
      <p>
        This Cookie Policy explains how {SITE_NAME} uses cookies and similar technologies when
        you visit xicmo.com or use our application.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">What are cookies?</h2>
      <p>
        Cookies are small text files stored on your device. We also use local storage for
        non-essential preferences (e.g. cookie consent choice, UI state).
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Cookies we use</h2>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Purpose</th>
            <th className="py-2">Required?</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          <tr className="border-b">
            <td className="py-2 pr-4 font-medium text-foreground">Essential</td>
            <td className="py-2 pr-4">Authentication session (Auth.js), security</td>
            <td className="py-2">Yes</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 pr-4 font-medium text-foreground">Functional</td>
            <td className="py-2 pr-4">Theme preference, cookie consent record</td>
            <td className="py-2">No</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 pr-4 font-medium text-foreground">Analytics</td>
            <td className="py-2 pr-4">Usage measurement (only if you accept)</td>
            <td className="py-2">No</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-10 text-2xl font-semibold">Managing cookies</h2>
      <p>
        Essential cookies cannot be disabled while using the signed-in product. You can clear
        cookies in your browser settings at any time. Our cookie banner lets you accept or
        decline non-essential cookies on first visit.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Third-party cookies</h2>
      <p>
        OAuth flows (Google, GitHub) and Stripe Checkout may set cookies on their domains during
        login or payment. Those are governed by the respective provider&apos;s policies.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Contact</h2>
      <p>
        Questions:{" "}
        <a href={mailto(CONTACT.privacy)} className="text-primary hover:underline">
          {CONTACT.privacy}
        </a>
      </p>
    </LegalPage>
  );
}
