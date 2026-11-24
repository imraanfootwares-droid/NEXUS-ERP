import { withPlatformTx } from "@/lib/db";
import { EnquiriesClient, type EnquiryRow } from "./_client";

export const dynamic = "force-dynamic";

export default async function PlatformEnquiriesPage() {
  const enquiries = await withPlatformTx(async (client) => {
    const res = await client.query<EnquiryRow>(
      "SELECT id, contact, business, interest, status, created_at FROM public.landing_enquiries ORDER BY created_at DESC LIMIT 500"
    );
    return res.rows;
  });

  return <EnquiriesClient enquiries={enquiries} />;
}
