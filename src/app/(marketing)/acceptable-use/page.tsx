import { LegalPage } from "@/frontend/components/marketing/legal-page";
import { CONTACT, SITE_NAME, mailto } from "@/shared/legal";

export const metadata = {
  title: "Acceptable Use Policy",
  description: `Rules for using ${SITE_NAME} responsibly and legally.`,
};

export default function AcceptableUsePage() {
  return (
    <LegalPage title="Acceptable Use Policy">
      <p>
        This Acceptable Use Policy (&quot;AUP&quot;) applies to all users of {SITE_NAME}. It
        supplements our <a href="/terms">Terms of Service</a>.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">You may not</h2>
      <ul className="list-disc pl-6">
        <li>Send spam, bulk unsolicited messages, or automated outreach that violates platform rules.</li>
        <li>Harass, threaten, defame, or discriminate against any person or group.</li>
        <li>Scrape or collect personal data in violation of GDPR, CCPA, or platform ToS.</li>
        <li>Publish illegal content, malware links, or material that infringes intellectual property.</li>
        <li>Attempt to bypass rate limits, abuse API credits, or share accounts to evade billing.</li>
        <li>Reverse-engineer, probe, or attack the Service or its infrastructure.</li>
        <li>Use agents to impersonate others or misrepresent your affiliation.</li>
        <li>Run agents against targets you do not have a legitimate business reason to engage.</li>
      </ul>

      <h2 className="mt-10 text-2xl font-semibold">Platform compliance</h2>
      <p>
        When you connect Reddit, X, LinkedIn, Instagram, or other networks, you must follow
        each platform&apos;s terms and automation policies. {SITE_NAME} provides tools; you are
        responsible for how they are used on connected accounts.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Enforcement</h2>
      <p>
        We may warn, suspend, or terminate accounts that violate this AUP. Serious violations may
        be reported to relevant authorities or platform operators.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Report abuse</h2>
      <p>
        Report violations to{" "}
        <a href={mailto(CONTACT.support)} className="text-primary hover:underline">
          {CONTACT.support}
        </a>
        .
      </p>
    </LegalPage>
  );
}
