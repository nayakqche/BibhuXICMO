import { LegalPage } from "@/frontend/components/marketing/legal-page";
import { CONTACT, LEGAL_ENTITY, LEGAL_JURISDICTION, SITE_NAME, mailto } from "@/shared/legal";

export const metadata = {
  title: "Terms of Service",
  description: `Terms governing your use of ${SITE_NAME}.`,
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of {SITE_NAME}{" "}
        (&quot;Service&quot;) operated by {LEGAL_ENTITY}. By creating an account or using the
        Service you agree to these Terms and our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">1. The service</h2>
      <p>
        {SITE_NAME} provides AI-powered marketing agents for SEO, GEO, content, and social
        channels. Agents produce drafts and recommendations; you review and approve before
        anything is published unless you explicitly enable automated publishing.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">2. Accounts</h2>
      <p>
        You must provide accurate information and keep your credentials secure. You are
        responsible for all activity under your account. Notify us immediately at{" "}
        <a href={mailto(CONTACT.support)} className="text-primary hover:underline">
          {CONTACT.support}
        </a>{" "}
        if you suspect unauthorized access.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">3. Acceptable use</h2>
      <p>
        You agree to comply with our{" "}
        <a href="/acceptable-use">Acceptable Use Policy</a> and with the terms of every
        third-party platform you connect (Reddit, X, LinkedIn, Instagram, etc.). You may not use
        the Service for spam, harassment, illegal activity, or to violate others&apos; rights.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">4. Subscriptions &amp; credits</h2>
      <p>
        Paid plans renew monthly via Stripe unless cancelled. Agent runs consume credits according
        to the plan shown on the pricing page. Unused credits do not roll over unless stated
        otherwise. See our <a href="/refund">Refund Policy</a> for cancellation and refunds.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">5. Your content</h2>
      <p>
        You retain ownership of content you create or upload. You grant us a limited license to
        process your workspace data solely to operate the Service (running agents, caching,
        displaying drafts). We do not claim ownership of your marketing copy or strategy
        documents.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">6. AI-generated output</h2>
      <p>
        Agent output may be inaccurate or incomplete. You are responsible for reviewing all
        drafts before publishing. {SITE_NAME} does not guarantee specific traffic, ranking,
        revenue, or engagement outcomes.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">7. Third-party services</h2>
      <p>
        The Service integrates with third-party APIs (LLMs, Apify, Google, Stripe, social
        networks). Their availability, pricing, and terms are outside our control. Outages or
        policy changes at those providers may affect the Service.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">8. Disclaimer of warranties</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES
        OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR
        PURPOSE, AND NON-INFRINGEMENT.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">9. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, {LEGAL_ENTITY.toUpperCase()} SHALL NOT BE LIABLE
        FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
        PROFITS, DATA, OR GOODWILL. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING FROM THESE TERMS
        OR THE SERVICE IS LIMITED TO THE AMOUNT YOU PAID US IN THE TWELVE MONTHS BEFORE THE
        CLAIM.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">10. Termination</h2>
      <p>
        You may delete your account at any time. We may suspend or terminate access if you breach
        these Terms or pose a security risk. Upon termination your right to use the Service ends;
        we may delete your data after a reasonable retention period.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">11. Changes</h2>
      <p>
        We may modify these Terms. Continued use after changes are posted constitutes acceptance.
        Material changes will be communicated via email or in-app notice where practicable.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">12. Contact</h2>
      <p>
        Legal inquiries:{" "}
        <a href={mailto(CONTACT.support)} className="text-primary hover:underline">
          {CONTACT.support}
        </a>
        . {LEGAL_JURISDICTION}
      </p>
    </LegalPage>
  );
}
