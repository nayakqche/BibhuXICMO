import { LegalPage } from "@/frontend/components/marketing/legal-page";
import { CONTACT, SUBPROCESSORS, SITE_NAME, mailto } from "@/shared/legal";

export const metadata = {
  title: "Subprocessors",
  description: `Third-party services ${SITE_NAME} uses to process data.`,
};

export default function SubprocessorsPage() {
  return (
    <LegalPage title="Subprocessors">
      <p>
        {SITE_NAME} uses the following third-party subprocessors to host, operate, and deliver
        the Service. Each processes data only as needed for their function. This list may be
        updated; material changes will be reflected on this page.
      </p>

      <div className="not-prose mt-8 overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-4 py-3 font-semibold">Provider</th>
              <th className="px-4 py-3 font-semibold">Purpose</th>
              <th className="px-4 py-3 font-semibold">Location</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((row) => (
              <tr key={row.name} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.purpose}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-2xl font-semibold">Enterprise DPA</h2>
      <p>
        Business customers requiring a Data Processing Agreement may contact{" "}
        <a href={mailto(CONTACT.privacy)} className="text-primary hover:underline">
          {CONTACT.privacy}
        </a>
        .
      </p>
    </LegalPage>
  );
}
